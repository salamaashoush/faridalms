import type {
  CcModule,
  CcResource,
  CcSubmission,
  CcVersion,
} from "@faridalms/domain/cartridge";
import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonBlock } from "@faridalms/domain/learning";

import { writeAudit } from "@faridalms/database/audit";
import { TenantUnavailableError } from "@faridalms/database/context";
import { bankPool } from "@faridalms/database/stores/bank";
import { classById } from "@faridalms/database/stores/classes";
import {
  assignmentById,
  classAssignments,
  handedInWork,
  namesOf,
  studentWork,
} from "@faridalms/database/stores/coursework";
import {
  documentOf,
  publishedVersion,
} from "@faridalms/database/stores/documents";
import { filesByIds } from "@faridalms/database/stores/files";
import { lessonsOf, yearUnitsOf } from "@faridalms/database/stores/learning";
import { mediaItemsByIds } from "@faridalms/database/stores/media";
import { bankQuestionOf } from "@faridalms/domain/bank";
import {
  canvasAssessment,
  canvasItem,
  canvasQtiManifest,
  canvasQuizMeta,
  ccAssignment,
  ccBank,
  CC13_TYPES,
  CC_FILEBASE,
  ccAssessment,
  ccItem,
  ccManifest,
  ccPage,
  ccTopic,
  ccTypesOf,
  plainFileName,
} from "@faridalms/domain/cartridge";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { contentHtml } from "@faridalms/domain/content-html";
import {
  contentDisposition,
  imageSize,
  safeFilename,
} from "@faridalms/domain/file";
import { lessonContentOf } from "@faridalms/domain/learning";
import {
  lessonOfContent,
  questionBlock,
  quizOfBrief,
} from "@faridalms/domain/lesson-content";
import { MAX_MEDIA_BATCH, usesMedia } from "@faridalms/domain/media";
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
import { can, localeOf, openUnit, schoolOf } from "../core/procedure";
import { reachesStudent, scopeFor, teaches } from "../core/reach";
import { refusalResponse } from "../core/refusal";
import { sharedInliner } from "../core/shared";
import { drawsOf, publishedQuiz } from "../quizzes/quiz";

const PATH = /^\/v1\/assignments\/([0-9a-f-]{36})\/work\.zip$/;
const PORTFOLIO = /^\/v1\/students\/([0-9a-f-]{36})\/portfolio\.zip$/;
const MODULE_QUESTIONS = /^\/v1\/modules\/([0-9a-f-]{36})\/questions\.zip$/;
const MODULE_CARTRIDGE = /^\/v1\/modules\/([0-9a-f-]{36})\/cartridge\.imscc$/;
const CLASS_CARTRIDGE = /^\/v1\/classes\/([0-9a-f-]{36})\/course\.imscc$/;
const MODULE_CANVAS_QUIZZES =
  /^\/v1\/modules\/([0-9a-f-]{36})\/canvas-quizzes\.zip$/;
const MEDIA_ITEMS = /^\/v1\/media\/items\.zip$/;
const ID = /^[0-9a-f-]{36}$/;

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
  ) => Promise<{ title: string; extension?: string; entries: Entry[] } | null>,
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
  return zipResponse(
    context,
    `${found.title}.${found.extension ?? "zip"}`,
    found.entries,
  );
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
    const content = document ? lessonContentOf(document.content) : undefined;
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

/**
 * A module's questions as Canvas exports its own quizzes for QTI: a quiz
 * for each lesson that asks any, every kind Canvas's quizzes and New
 * Quizzes hold written as Canvas writes it, and the pictures they show.
 * Only a teacher who may change the module gets it, and the export is
 * recorded.
 */
async function moduleCanvasQuizzes(
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
    const content = document ? lessonContentOf(document.content) : undefined;
    if (!content) continue;
    const blocks = lessonOfContent(content).blocks.filter(
      (block) => "prompt" in block,
    );
    if (blocks.length > 0) lessons.push({ title: lesson.title, blocks });
  }
  const entries: Entry[] = [];
  const shown = new Map<string, string>();
  const taken = new Set<string>();
  const files = await filesByIds(unit.tx, unit.tenantId, [
    ...new Set(lessons.flatMap((lesson) => lesson.blocks.flatMap(qtiPictures))),
  ]);
  for (const file of files.filter((item) => item.state === "ready")) {
    const name = plainUnique(file.name, taken, "picture");
    shown.set(file.id, name);
    entries.push({
      path: `web_resources/media/${name}`,
      storageKey: file.storageKey,
    });
  }
  const quizzes: { ident: string; href: string; meta: string }[] = [];
  let skipped = 0;
  for (const [index, lesson] of lessons.entries()) {
    const ident = `quiz_${index + 1}`;
    const items = lesson.blocks.flatMap((block, at) => {
      const xml = canvasItem(block, {
        ident: `${ident}_q${at + 1}`,
        picture: (fileId) => {
          const name = shown.get(fileId);
          return name ? `${CC_FILEBASE}/media/${name}` : null;
        },
      });
      if (!xml) skipped += 1;
      return xml ? [xml] : [];
    });
    if (items.length === 0) continue;
    const points = lesson.blocks.reduce(
      (sum, block) =>
        sum +
        (block.type === "poll" || !("points" in block) ? 0 : block.points),
      0,
    );
    const href = `${ident}/${ident}.xml`;
    const meta = `${ident}/assessment_meta.xml`;
    entries.push(
      {
        path: href,
        text: canvasAssessment({ ident, title: lesson.title, items }),
      },
      {
        path: meta,
        text: canvasQuizMeta({ ident, title: lesson.title, points }),
      },
    );
    quizzes.push({ ident, href, meta });
  }
  entries.unshift({
    path: "imsmanifest.xml",
    text: canvasQtiManifest({
      identifier: `canvas_quizzes_${module.id.replaceAll("-", "")}`,
      title: module.title,
      quizzes,
      media: [...shown.values()].map((name) => `web_resources/media/${name}`),
    }),
  });
  await writeAudit(unit.tx, unit.tenantId, {
    action: "module.questions_exported",
    objectType: "learning_module",
    objectId: module.id,
    orgId: unit.schoolId,
    details: { quizzes: quizzes.length, skipped, format: "canvas_qti" },
  });
  return { title: `${module.title} - Canvas quizzes`, entries };
}

/** A unique name in the package's shared files, the same in every LMS. */
function plainUnique(name: string, taken: Set<string>, fallback: string) {
  const plain = plainFileName(name, fallback);
  const dot = plain.lastIndexOf(".");
  let candidate = plain;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1)
    candidate =
      dot > 0
        ? `${plain.slice(0, dot)}-${n}${plain.slice(dot)}`
        : `${plain}-${n}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

type CartridgeLesson = {
  title: string;
  language: string | null;
  content: ContentDocument;
};

/**
 * A module's lessons as they are stored, in their order, each shared block
 * written out, since the system they go to keeps none of the school's.
 */
async function cartridgeLessons(
  unit: UnitContext,
  moduleId: string,
): Promise<CartridgeLesson[]> {
  const lessons: CartridgeLesson[] = [];
  for (const lesson of await lessonsOf(unit.tx, unit.tenantId, moduleId)) {
    const document = await documentOf(unit.tx, unit.tenantId, {
      type: "lesson",
      id: lesson.id,
    });
    const content = document ? lessonContentOf(document.content) : undefined;
    if (content)
      lessons.push({ title: lesson.title, language: lesson.language, content });
  }
  const inline = await sharedInliner(
    unit,
    lessons.map((lesson) => lesson.content),
  );
  return lessons.map((lesson) => ({
    title: lesson.title,
    language: lesson.language,
    content: inline(lesson.content),
  }));
}

/**
 * The package's shared files, each stored once under `web_resources/` with a
 * plain name every LMS resolves alike.
 */
async function sharedFiles(
  unit: UnitContext,
  fileIds: readonly string[],
  entries: Entry[],
): Promise<Map<string, string>> {
  const shared = new Map<string, string>();
  const taken = new Set<string>();
  const files = await filesByIds(unit.tx, unit.tenantId, [...new Set(fileIds)]);
  for (const file of files.filter((item) => item.state === "ready")) {
    const href = `web_resources/${plainUnique(file.name, taken, "file")}`;
    shared.set(file.id, href);
    entries.push({ path: href, storageKey: file.storageKey });
  }
  return shared;
}

/**
 * A module's lessons as a cartridge holds them: each a page, its questions a
 * quiz after it in CC's profile, its links to outside tools, and the lesson
 * kept whole beside them. Names start with `prefix`, so several modules fit
 * one package.
 */
async function lessonResources(
  unit: UnitContext,
  input: {
    lessons: readonly CartridgeLesson[];
    shared: ReadonlyMap<string, string>;
    prefix: string;
    version: CcVersion;
  },
) {
  const { shared, prefix, version } = input;
  const types = ccTypesOf(version);
  const sharedDependency = shared.size > 0 ? ["web_resources"] : [];
  const questionsWord = localeOf(unit) === "ar" ? "أسئلة" : "questions";
  const entries: Entry[] = [];
  const items: CcModule["items"] = [];
  const resources: CcResource[] = [];
  const kept: string[] = [];
  let skipped = 0;
  for (const [index, lesson] of input.lessons.entries()) {
    const n = `${prefix}${index + 1}`;
    const keptPath = `farida/lessons/${n}.json`;
    kept.push(keptPath);
    entries.push({
      path: keptPath,
      text: JSON.stringify({
        version: 1,
        title: lesson.title,
        language: lesson.language,
        content: lesson.content,
        files: Object.fromEntries(
          contentFileIds(lesson.content).flatMap((id) => {
            const href = shared.get(id);
            return href ? [[id, href]] : [];
          }),
        ),
      }),
    });
    const page = `${prefix}l${index + 1}/${plainFileName(lesson.title.replaceAll(".", " "), `lesson-${index + 1}`)}.html`;
    entries.push({
      path: page,
      text: ccPage({
        title: lesson.title,
        kept: `../${keptPath}`,
        body: contentHtml(lesson.content, {
          fileHref: (id) => {
            const href = shared.get(id);
            return href ? `../${href}` : null;
          },
        }),
      }),
    });
    const lessonId = `${prefix}l${index + 1}`;
    resources.push({
      identifier: lessonId,
      type: types.page,
      href: page,
      files: [page],
      dependencies: sharedDependency,
    });
    items.push({
      identifier: `item_${lessonId}`,
      title: lesson.title,
      resource: lessonId,
    });
    const quizId = `${prefix}q${index + 1}`;
    const questions = lessonOfContent(lesson.content).blocks.flatMap(
      (block, at) => {
        const xml = ccItem(block, {
          ident: `${lessonId}_q${at + 1}`,
          picture: (id) => {
            const href = shared.get(id);
            return href ? `${CC_FILEBASE}../${href}` : null;
          },
        });
        if (!xml && "prompt" in block) skipped += 1;
        return xml ? [xml] : [];
      },
    );
    if (questions.length > 0) {
      const title = `${lesson.title}: ${questionsWord}`;
      const path = `${quizId}/assessment.xml`;
      entries.push({
        path,
        text: ccAssessment({
          ident: `${quizId}_quiz`,
          title,
          items: questions,
          version,
        }),
      });
      resources.push({
        identifier: quizId,
        type: types.quiz,
        files: [path],
        dependencies: sharedDependency,
      });
      items.push({ identifier: `item_${quizId}`, title, resource: quizId });
    }
  }
  return { entries, items, resources, kept, skipped };
}

/** What closes every package: its shared files, and the lessons kept whole for this app. */
function closingResources(
  version: CcVersion,
  shared: ReadonlyMap<string, string>,
  kept: string[],
): CcResource[] {
  const types = ccTypesOf(version);
  return [
    ...(shared.size > 0
      ? [
          {
            identifier: "web_resources",
            type: types.page,
            files: [...shared.values()],
          },
        ]
      : []),
    {
      identifier: "farida",
      type: types.kept,
      files: kept,
      instructorOnly: true,
    },
  ];
}

/**
 * A module as a Common Cartridge 1.1, for Moodle, Canvas and the like:
 * each lesson a page, its questions a quiz after it, its links to outside
 * tools, the files they all show, and each lesson kept whole beside them
 * for this app to bring back. Only a teacher who may change the module
 * gets it, and the export is recorded.
 */
async function moduleCartridge(
  unit: UnitContext,
  moduleId: string,
): Promise<{ title: string; extension: string; entries: Entry[] } | null> {
  const module = await editableModule(unit, moduleId);
  const lessons = await cartridgeLessons(unit, module.id);
  const entries: Entry[] = [];
  const shared = await sharedFiles(
    unit,
    lessons.flatMap((lesson) => contentFileIds(lesson.content)),
    entries,
  );
  const built = await lessonResources(unit, {
    lessons,
    shared,
    prefix: "",
    version: "1.1",
  });
  entries.push(...built.entries);
  entries.unshift({
    path: "imsmanifest.xml",
    text: ccManifest({
      identifier: `farida_${module.id.replaceAll("-", "")}`,
      title: module.title,
      modules: [
        { identifier: "module_1", title: module.title, items: built.items },
      ],
      resources: [
        ...built.resources,
        ...closingResources("1.1", shared, built.kept),
      ],
    }),
  });
  await writeAudit(unit.tx, unit.tenantId, {
    action: "module.cartridge_exported",
    objectType: "learning_module",
    objectId: module.id,
    orgId: unit.schoolId,
    details: {
      lessons: lessons.length,
      files: shared.size,
      skipped: built.skipped,
    },
  });
  return { title: module.title, extension: "imscc", entries };
}

/** How a brief asks for work, in CC 1.3's and Canvas's terms. */
const SUBMISSION_OF: Partial<Record<string, CcSubmission>> = {
  online: "online",
  files: "files",
  both: "both",
  online_and_files: "both",
  none: "none",
};

/**
 * A class as a Common Cartridge 1.3, for Canvas and the LMSs that read the
 * newer version: each of its modules in the order the class takes them,
 * as the module export writes one, and a last module of its coursework,
 * each assignment with its brief, points, how work is handed in and when
 * it is due, each quiz in CC's profile and each discussion as a topic.
 * Moodle reads only CC 1.1, so this is not for it. Only a teacher of the
 * class who sets work gets it, and the export is recorded.
 */
async function classCartridge(
  unit: UnitContext,
  classId: string,
): Promise<{ title: string; extension: string; entries: Entry[] } | null> {
  const scope = scopeFor(unit, "teaching");
  if (
    !can(unit, "assignments:author") ||
    !(await teaches(unit, "teaching", classId))
  )
    return null;
  const taught = await classById(unit.tx, scope, classId);
  if (!taught) return null;
  const units = await yearUnitsOf(unit.tx, {
    tenantId: unit.tenantId,
    classId,
  });
  const modules = [];
  for (const each of units)
    modules.push({ ...each, lessons: await cartridgeLessons(unit, each.id) });
  const assignments = [];
  // The questions each draw picks from, by its teacher and tag.
  const pools = new Map<
    string,
    {
      tag: string;
      questions: { block: LessonBlock; content: ContentDocument }[];
    }
  >();
  for (const assignment of await classAssignments(
    unit.tx,
    unit.tenantId,
    classId,
  )) {
    const document = await documentOf(unit.tx, unit.tenantId, {
      type: "assignment",
      id: assignment.id,
    });
    if (!document) continue;
    // Work already out reads as it was last set; a draft as it is written.
    const published =
      assignment.state === "draft"
        ? null
        : await publishedVersion(unit.tx, unit.tenantId, document.id);
    const brief = lessonContentOf((published ?? document).content);
    // A quiz may keep its questions apart from its brief once it is set.
    const quiz =
      assignment.submissionFormat === "quiz"
        ? ((assignment.state === "draft"
            ? null
            : await publishedQuiz(unit, assignment.id)) ?? quizOfBrief(brief))
        : null;
    for (const draw of quiz ? drawsOf(quiz) : []) {
      const key = `${assignment.authorUserId}:${draw.tag}`;
      if (pools.has(key)) continue;
      const rows = await bankPool(unit.tx, {
        tenantId: unit.tenantId,
        orgId: unit.schoolId,
        authorUserId: assignment.authorUserId,
        tag: draw.tag,
      });
      pools.set(key, {
        tag: draw.tag,
        questions: rows.flatMap((row) => {
          const content = lessonContentOf(row.content);
          const node = bankQuestionOf(content);
          const block = node ? questionBlock(node) : null;
          return block ? [{ block, content }] : [];
        }),
      });
    }
    assignments.push({ ...assignment, brief, quiz });
  }
  const inline = await sharedInliner(
    unit,
    assignments.map((assignment) => assignment.brief),
  );
  for (const assignment of assignments)
    assignment.brief = inline(assignment.brief);
  const entries: Entry[] = [];
  const shared = await sharedFiles(
    unit,
    [
      ...modules.flatMap((module) =>
        module.lessons.flatMap((lesson) => contentFileIds(lesson.content)),
      ),
      ...assignments.flatMap((assignment) => contentFileIds(assignment.brief)),
      ...[...pools.values()].flatMap((pool) =>
        pool.questions.flatMap((question) => contentFileIds(question.content)),
      ),
    ],
    entries,
  );
  const types = CC13_TYPES;
  const ccModules: CcModule[] = [];
  const resources: CcResource[] = [];
  const kept: string[] = [];
  let skipped = 0;
  for (const [index, module] of modules.entries()) {
    const built = await lessonResources(unit, {
      lessons: module.lessons,
      shared,
      prefix: `m${index + 1}_`,
      version: "1.3",
    });
    entries.push(...built.entries);
    resources.push(...built.resources);
    kept.push(...built.kept);
    skipped += built.skipped;
    ccModules.push({
      identifier: `module_${index + 1}`,
      title: module.title,
      items: built.items,
    });
  }
  const sharedDependency = shared.size > 0 ? ["web_resources"] : [];
  // Files in a descriptor's HTML are named from the descriptor's folder.
  const fromDescriptor = (id: string) => {
    const href = shared.get(id);
    return href ? `${CC_FILEBASE}../${href}` : null;
  };
  const coursework: CcModule["items"] = [];
  for (const [index, assignment] of assignments.entries()) {
    const n = index + 1;
    if (assignment.quiz) {
      // A draw asks as many of its pool as it would draw, worth what it
      // gives each; the whole pool goes beside the quiz as a bank.
      const asked = assignment.quiz.blocks.flatMap((block): LessonBlock[] =>
        block.type === "draw"
          ? (
              pools.get(`${assignment.authorUserId}:${block.tag}`)?.questions ??
              []
            )
              .slice(0, block.count)
              .map(({ block: drawn }) =>
                "points" in drawn && drawn.type !== "poll"
                  ? { ...drawn, points: block.points }
                  : drawn,
              )
          : [block],
      );
      const items = asked.flatMap((block, at) => {
        const xml = ccItem(block, {
          ident: `c${n}_q${at + 1}`,
          picture: fromDescriptor,
        });
        if (!xml && "prompt" in block) skipped += 1;
        return xml ? [xml] : [];
      });
      if (items.length === 0) continue;
      const path = `c${n}/assessment.xml`;
      entries.push({
        path,
        text: ccAssessment({
          ident: `c${n}_quiz`,
          title: assignment.title,
          items,
          version: "1.3",
        }),
      });
      resources.push({
        identifier: `c${n}`,
        type: types.quiz,
        files: [path],
        dependencies: sharedDependency,
      });
    } else if (assignment.submissionFormat === "discussion") {
      const path = `c${n}/topic.xml`;
      entries.push({
        path,
        text: ccTopic({
          title: assignment.title,
          html: contentHtml(assignment.brief, { fileHref: fromDescriptor }),
          version: "1.3",
        }),
      });
      resources.push({
        identifier: `c${n}`,
        type: types.topic,
        files: [path],
        dependencies: sharedDependency,
      });
    } else {
      const path = `c${n}/assignment.xml`;
      const page = `c${n}/${plainFileName(assignment.title.replaceAll(".", " "), `assignment-${n}`)}.html`;
      entries.push(
        {
          path,
          text: ccAssignment({
            identifier: `c${n}`,
            title: assignment.title,
            html: contentHtml(assignment.brief, { fileHref: fromDescriptor }),
            points: assignment.points,
            dueAt: assignment.dueAt,
            submission: SUBMISSION_OF[assignment.submissionFormat] ?? "both",
          }),
        },
        {
          path: page,
          text: ccPage({
            title: assignment.title,
            kept: "",
            body: contentHtml(assignment.brief, {
              fileHref: (id) => {
                const href = shared.get(id);
                return href ? `../${href}` : null;
              },
            }),
          }),
        },
      );
      resources.push(
        {
          identifier: `c${n}`,
          type: types.assignment,
          href: path,
          files: [path],
          dependencies: sharedDependency,
        },
        {
          identifier: `c${n}_fallback`,
          type: types.page,
          files: [page],
          variantOf: `c${n}`,
        },
      );
    }
    coursework.push({
      identifier: `item_c${n}`,
      title: assignment.title,
      resource: `c${n}`,
    });
  }
  for (const [index, pool] of [...pools.values()].entries()) {
    const identifier = `b${index + 1}`;
    const items = pool.questions.flatMap((question, at) => {
      const xml = ccItem(question.block, {
        ident: `${identifier}_q${at + 1}`,
        picture: fromDescriptor,
      });
      return xml ? [xml] : [];
    });
    if (items.length === 0) continue;
    const path = `${identifier}/bank.xml`;
    entries.push({
      path,
      text: ccBank({
        ident: identifier,
        title: pool.tag,
        items,
        version: "1.3",
      }),
    });
    resources.push({
      identifier,
      type: types.bank,
      files: [path],
      dependencies: sharedDependency,
    });
  }
  if (coursework.length > 0)
    ccModules.push({
      identifier: "coursework",
      title: localeOf(unit) === "ar" ? "الواجبات" : "Coursework",
      items: coursework,
    });
  const title = taught.titleEn || taught.titleAr || taught.code;
  entries.unshift({
    path: "imsmanifest.xml",
    text: ccManifest({
      identifier: `farida_${classId.replaceAll("-", "")}`,
      title,
      modules: ccModules,
      resources: [...resources, ...closingResources("1.3", shared, kept)],
      version: "1.3",
    }),
  });
  await writeAudit(unit.tx, unit.tenantId, {
    action: "class.cartridge_exported",
    objectType: "class",
    objectId: classId,
    orgId: unit.schoolId,
    details: {
      modules: modules.length,
      assignments: coursework.length,
      files: shared.size,
      skipped,
    },
  });
  return { title, extension: "imscc", entries };
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
  const questions = MODULE_QUESTIONS.exec(url.pathname)?.[1];
  if (questions)
    return exported(context, (unit) => moduleQuestions(unit, questions));
  const cartridge = MODULE_CARTRIDGE.exec(url.pathname)?.[1];
  if (cartridge)
    return exported(context, (unit) => moduleCartridge(unit, cartridge));
  const course = CLASS_CARTRIDGE.exec(url.pathname)?.[1];
  if (course) return exported(context, (unit) => classCartridge(unit, course));
  if (MEDIA_ITEMS.test(url.pathname)) {
    const ids = [
      ...new Set((url.searchParams.get("ids") ?? "").split(",")),
    ].filter((id) => ID.test(id));
    if (ids.length === 0 || ids.length > MAX_MEDIA_BATCH)
      return problem(400, "BAD_REQUEST", context.requestId);
    return exported(context, (unit) => mediaItemsZip(unit, ids));
  }
  const canvas = MODULE_CANVAS_QUIZZES.exec(url.pathname)?.[1];
  if (canvas)
    return exported(context, (unit) => moduleCanvasQuizzes(unit, canvas));
  return null;
}
