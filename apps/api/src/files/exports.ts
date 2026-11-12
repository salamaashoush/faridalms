import type { ContentDocument } from "@faridalms/domain/content";

import { writeAudit } from "@faridalms/database/audit";
import { TenantUnavailableError } from "@faridalms/database/context";
import {
  assignmentById,
  handedInWork,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesByIds } from "@faridalms/database/stores/files";
import { mediaItemsByIds } from "@faridalms/database/stores/media";
import { namesOf } from "@faridalms/database/stores/persons";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { contentDisposition, safeFilename } from "@faridalms/domain/file";
import { MAX_MEDIA_BATCH, usesMedia } from "@faridalms/domain/media";
import { ORPCError } from "@orpc/server";
import { Zip, ZipPassThrough } from "fflate";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";

import { can, openUnit, schoolOf } from "../core/procedure";
import { reachesStudent, teaches } from "../core/reach";
import { refusalResponse } from "../core/refusal";

const PATH = /^\/v1\/assignments\/([0-9a-f-]{36})\/work\.zip$/;
const PORTFOLIO = /^\/v1\/students\/([0-9a-f-]{36})\/portfolio\.zip$/;
const MEDIA_ITEMS = /^\/v1\/media\/items\.zip$/;
const ID = /^[0-9a-f-]{36}$/;

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
    !(await teaches(unit, "teaching", assignment.classId))
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
  name: string,
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
      "content-disposition": contentDisposition(name),
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
    found = await openUnit(scoped, "session", (unit) =>
      build({ ...scoped, ...unit }),
    );
  } catch (error) {
    if (error instanceof ORPCError)
      return refusalResponse(error, context.requestId);
    if (error instanceof TenantUnavailableError)
      return problem(503, "tenant.read_only", context.requestId);
    throw error;
  }
  if (!found) return problem(404, "NOT_FOUND", context.requestId);
  return zipResponse(context, `${found.title}.zip`, found.entries);
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
    (await reachesStudent(unit, "teaching", studentId));
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

/**
 * Items of the school's media as one zip, for those who use it,
 * each under its name; items in the trash are left out.
 */
async function mediaItemsZip(
  unit: UnitContext,
  ids: readonly string[],
): Promise<{ title: string; entries: Entry[] } | null> {
  if (!usesMedia([...unit.actor.capabilities])) return null;
  const items = await mediaItemsByIds(
    unit.tx,
    unit.tenantId,
    unit.schoolId,
    ids,
  );
  const files = await filesByIds(
    unit.tx,
    unit.tenantId,
    items.filter((item) => !item.trashedAt).map((item) => item.id),
  );
  if (files.length === 0) return null;
  const names = new Set<string>();
  return {
    title: "media",
    entries: files
      .filter((file) => file.state === "ready" && file.keyVersion === null)
      .map((file) => ({
        path: unique(file.name, names),
        storageKey: file.storageKey,
      })),
  };
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
  if (MEDIA_ITEMS.test(url.pathname)) {
    const ids = [
      ...new Set((url.searchParams.get("ids") ?? "").split(",")),
    ].filter((id) => ID.test(id));
    if (ids.length === 0 || ids.length > MAX_MEDIA_BATCH)
      return problem(400, "BAD_REQUEST", context.requestId);
    return exported(context, (unit) => mediaItemsZip(unit, ids));
  }
  return null;
}
