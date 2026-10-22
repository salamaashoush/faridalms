import type { ContentDocument } from "@faridalms/domain/content";

import { writeAudit } from "@faridalms/database/audit";
import { TenantUnavailableError } from "@faridalms/database/context";
import { teachesClass } from "@faridalms/database/stores/classes";
import {
  assignmentById,
  handedInWork,
  namesOf,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesByIds } from "@faridalms/database/stores/files";
import { lessonsOf } from "@faridalms/database/stores/learning";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  contentDisposition,
  imageSize,
  safeFilename,
} from "@faridalms/domain/file";
import { lessonOfContent } from "@faridalms/domain/lesson-content";
import {
  qtiItem,
  qtiManifest,
  qtiPictures,
  qtiTest,
} from "@faridalms/domain/qti";
import { ORPCError } from "@orpc/server";
import { Zip, ZipPassThrough } from "fflate";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";

import { editableModule } from "../core/learning-access";
import { can, openUnit, schoolOf } from "../core/procedure";

const PATH = /^\/v1\/assignments\/([0-9a-f-]{36})\/work\.zip$/;
const PORTFOLIO = /^\/v1\/students\/([0-9a-f-]{36})\/portfolio\.zip$/;
const MODULE_QUESTIONS = /^\/v1\/modules\/([0-9a-f-]{36})\/questions\.zip$/;

/** As much of a picture as is read for its size. */
const HEAD_BYTES = 64 * 1024;

interface Entry {
  path: string;
  text?: string;
  storageKey?: string;
}

function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

/** A folder or file name that cannot climb out of the archive or clash. */
function unique(name: string, taken: Set<string>): string {
  const safe = safeFilename(name).replaceAll("/", "-") || "file";
  let candidate = safe;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    const dot = safe.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${safe.slice(0, dot)} (${n})${safe.slice(dot)}`
        : `${safe} (${n})`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** An attempt's answer as text and each file it holds, in one folder. */
async function attemptEntries(
  unit: UnitContext,
  attemptId: string,
  folder: string,
): Promise<Entry[]> {
  const answer = await documentOf(unit.tx, unit.tenantId, {
    type: "submission_attempt",
    id: attemptId,
  });
  const content = answer?.content as unknown as ContentDocument | undefined;
  const names = new Set<string>();
  const entries: Entry[] = [];
  if (content && contentPlainText(content).trim())
    entries.push({
      path: `${folder}/${unique("answer.txt", names)}`,
      text: contentPlainText(content),
    });
  const files = content
    ? await filesByIds(unit.tx, unit.tenantId, contentFileIds(content))
    : [];
  for (const file of files.filter((item) => item.state === "ready"))
    entries.push({
      path: `${folder}/${unique(file.name, names)}`,
      storageKey: file.storageKey,
    });
  return entries;
}

/**
 * What the archive holds: one folder per student with work handed in, their
 * latest attempt's answer as text and each file it holds. Only a teacher of
 * the class, who may grade, gets it, and the export is recorded.
 */
async function entriesFor(
  unit: UnitContext,
  assignmentId: string,
): Promise<{ title: string; entries: Entry[] } | null> {
  if (!can(unit, "submissions:grade")) return null;
  const assignment = await assignmentById(unit.tx, unit.tenantId, assignmentId);
  if (
    !assignment ||
    assignment.orgId !== unit.schoolId ||
    !(await teachesClass(
      unit.tx,
      {
        tenantId: unit.tenantId,
        schoolId: unit.schoolId,
        today: unit.today,
        viewerId: unit.actor.userId,
        schoolWide: can(unit, "classes:manage"),
      },
      assignment.classId,
    ))
  )
    return null;
  const rows = await studentWork(unit.tx, {
    tenantId: unit.tenantId,
    assignmentId: assignment.id,
  });
  const entries: Entry[] = [];
  const folders = new Set<string>();
  for (const row of rows.filter((item) => item.attemptId)) {
    const folder = unique(
      [row.fullNameEn ?? row.fullNameAr ?? "student", row.isLate ? "late" : ""]
        .filter(Boolean)
        .join(" - "),
      folders,
    );
    entries.push(...(await attemptEntries(unit, row.attemptId ?? "", folder)));
  }
  await writeAudit(unit.tx, unit.tenantId, {
    action: "assignment.work_exported",
    objectType: "assignment",
    objectId: assignment.id,
    orgId: unit.schoolId,
    details: { students: folders.size, files: entries.length },
  });
  return { title: assignment.title, entries };
}

/** Entries streamed as a zip as they are read, so a large one never sits in memory. */
function zipResponse(
  context: RequestContext,
  title: string,
  entries: Entry[],
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      for (const entry of entries) {
        const part = new ZipPassThrough(entry.path);
        zip.add(part);
        if (entry.text !== undefined) {
          part.push(new TextEncoder().encode(entry.text), true);
          continue;
        }
        const body = entry.storageKey
          ? await context.files.open(entry.storageKey)
          : null;
        if (!body) {
          part.push(new Uint8Array(), true);
          continue;
        }
        for await (const chunk of body) part.push(chunk);
        part.push(new Uint8Array(), true);
      }
      zip.end();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": contentDisposition(`${title}.zip`),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Builds an export's entries in a unit of work, answering its refusals. */
async function exported(
  context: RequestContext,
  build: (
    unit: UnitContext,
  ) => Promise<{ title: string; entries: Entry[] } | null>,
): Promise<Response> {
  const school = await schoolOf(context);
  if (!school) return problem(401, "UNAUTHORIZED", context.requestId);
  const scoped: SchoolContext = { ...context, school };
  let found: Awaited<ReturnType<typeof build>>;
  try {
    found = await openUnit(scoped, "write", (unit) =>
      build({ ...scoped, ...unit }),
    );
  } catch (error) {
    if (error instanceof ORPCError)
      return problem(error.status, error.code, context.requestId);
    if (error instanceof TenantUnavailableError)
      return problem(503, "tenant.read_only", context.requestId);
    throw error;
  }
  if (!found) return problem(404, "NOT_FOUND", context.requestId);
  return zipResponse(context, found.title, found.entries);
}

/**
 * A student's portfolio: every piece of work they have handed in, a folder
 * each with its latest attempt's answer and files. The student may take it,
 * and so may staff who reach their record; each export is recorded.
 */
async function portfolioFor(
  unit: UnitContext,
  studentId: string,
): Promise<{ title: string; entries: Entry[] } | null> {
  const own = unit.actor.userId === studentId;
  const staff =
    can(unit, "people:read") &&
    (await isVisibleStudent(
      unit.tx,
      {
        tenantId: unit.tenantId,
        schoolId: unit.schoolId,
        today: unit.today,
        viewerId: unit.actor.userId,
        schoolWide: can(unit, "classes:manage"),
      },
      studentId,
    ));
  if (!own && !staff) return null;
  const work = await handedInWork(unit.tx, {
    tenantId: unit.tenantId,
    orgId: unit.schoolId,
    studentId,
  });
  const [person] = await namesOf(unit.tx, unit.tenantId, [studentId]);
  const entries: Entry[] = [];
  const folders = new Set<string>();
  for (const row of work) {
    const folder = unique(
      `${row.submittedAt.slice(0, 10)} ${row.classCode} ${row.title}`,
      folders,
    );
    entries.push(...(await attemptEntries(unit, row.attemptId, folder)));
  }
  await writeAudit(unit.tx, unit.tenantId, {
    action: "student.portfolio_exported",
    objectType: "user",
    objectId: studentId,
    subjectUserId: studentId,
    orgId: unit.schoolId,
    details: { pieces: folders.size, files: entries.length },
  });
  const name = person?.fullNameEn ?? person?.fullNameAr ?? "portfolio";
  return { title: name, entries };
}

/** A picture's first bytes, enough to read its size from. */
async function headOf(
  unit: UnitContext,
  file: { storageKey: string; sizeBytes: number },
): Promise<Uint8Array> {
  const body = await unit.files.open(file.storageKey, {
    start: 0,
    end: Math.min(file.sizeBytes, HEAD_BYTES) - 1,
  });
  if (!body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  const head = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let at = 0;
  for (const chunk of chunks) {
    head.set(chunk, at);
    at += chunk.length;
  }
  return head;
}

/**
 * A module's questions as a QTI 3.0 package, for another system to ask
 * them: an item for each question its lessons ask as they are written, a
 * test for each lesson, and the pictures they show. A question QTI cannot
 * hold, as a coding exercise, is left out. Only a teacher who may change
 * the module gets it, and the export is recorded.
 */
async function moduleQuestions(
  unit: UnitContext,
  moduleId: string,
): Promise<{ title: string; entries: Entry[] } | null> {
  const module = await editableModule(unit, moduleId);
  const lessons = [];
  for (const lesson of await lessonsOf(unit.tx, unit.tenantId, module.id)) {
    const document = await documentOf(unit.tx, unit.tenantId, {
      type: "lesson",
      id: lesson.id,
    });
    const content = document?.content as unknown as ContentDocument | undefined;
    if (!content) continue;
    lessons.push({
      title: lesson.title,
      blocks: lessonOfContent(content).blocks.filter(
        (block) => "prompt" in block,
      ),
    });
  }
  const entries: Entry[] = [];
  const names = new Set<string>();
  const media = new Map<
    string,
    { href: string; width: number | null; height: number | null }
  >();
  const pictured = [
    ...new Set(lessons.flatMap((lesson) => lesson.blocks.flatMap(qtiPictures))),
  ];
  const files = await filesByIds(unit.tx, unit.tenantId, pictured);
  for (const file of files.filter((item) => item.state === "ready")) {
    const href = `media/${unique(file.name, names)}`;
    const size = file.mediaType.startsWith("image/")
      ? imageSize(await headOf(unit, file))
      : null;
    media.set(file.id, {
      href,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });
    entries.push({ path: href, storageKey: file.storageKey });
  }
  const items: { identifier: string; href: string; media: string[] }[] = [];
  const tests: { identifier: string; href: string; items: string[] }[] = [];
  let skipped = 0;
  for (const lesson of lessons) {
    const asked: { identifier: string; href: string }[] = [];
    for (const [index, block] of lesson.blocks.entries()) {
      const identifier = `Q${items.length + 1}`;
      const xml = qtiItem(block, {
        identifier,
        title: `${lesson.title} ${index + 1}`,
        picture: (fileId) => {
          const found = media.get(fileId);
          return found ? { ...found, href: `../${found.href}` } : null;
        },
      });
      if (!xml) {
        skipped += 1;
        continue;
      }
      const href = `items/${identifier.toLowerCase()}.xml`;
      entries.push({ path: href, text: xml });
      items.push({
        identifier,
        href,
        media: qtiPictures(block).flatMap((fileId) => {
          const found = media.get(fileId);
          return found ? [found.href] : [];
        }),
      });
      asked.push({ identifier, href: `../${href}` });
    }
    if (asked.length === 0) continue;
    const identifier = `T${tests.length + 1}`;
    const href = `tests/${identifier.toLowerCase()}.xml`;
    entries.push({
      path: href,
      text: qtiTest({ identifier, title: lesson.title, items: asked }),
    });
    tests.push({
      identifier,
      href,
      items: asked.map((item) => item.identifier),
    });
  }
  entries.unshift({
    path: "imsmanifest.xml",
    text: qtiManifest({
      identifier: `MANIFEST-${module.id}`,
      items,
      tests,
      media: [...new Set(items.flatMap((item) => item.media))],
    }),
  });
  await writeAudit(unit.tx, unit.tenantId, {
    action: "module.questions_exported",
    objectType: "learning_module",
    objectId: module.id,
    orgId: unit.schoolId,
    details: { items: items.length, skipped },
  });
  return { title: `${module.title} - QTI`, entries };
}

/** The exports this handler answers, by path. */
export async function handleWorkExport(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const work = PATH.exec(url.pathname)?.[1];
  if (work) return exported(context, (unit) => entriesFor(unit, work));
  const student = PORTFOLIO.exec(url.pathname)?.[1];
  if (student) return exported(context, (unit) => portfolioFor(unit, student));
  const questions = MODULE_QUESTIONS.exec(url.pathname)?.[1];
  if (questions)
    return exported(context, (unit) => moduleQuestions(unit, questions));
  return null;
}
