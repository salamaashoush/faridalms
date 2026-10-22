import type {
  LessonRow,
  ModuleAudienceRow,
  ModuleRow,
  ProgressRow,
  WatchRow,
} from "@faridalms/database/stores/learning";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  CheckBlock,
  FeedbackShown,
  LessonCompletion,
  LessonCondition,
  LessonDocument,
  LessonResponse,
  LessonResult,
} from "@faridalms/domain/learning";
import type { ScratchFeature } from "@faridalms/domain/scratch-project";

import { arrangementsOf } from "@faridalms/database/stores/arrangements";
import { reachOf } from "@faridalms/database/stores/audiences";
import {
  classesTaughtBy,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { groupsOf, namesOf } from "@faridalms/database/stores/coursework";
import {
  contentsOf,
  documentOf,
  dropTranslation,
  publishedVersion,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
} from "@faridalms/database/stores/documents";
import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import {
  classesOfModule,
  firstAttempts,
  pollVotes,
  insertLesson,
  insertResponse,
  queueProgramRemark,
  insertModule,
  keepCode as keepOwnCode,
  lessonById,
  lessonSoundsOf,
  lessonsOf,
  liveActivity,
  pace as pacePaced,
  pacedById,
  responsesSince,
  runningPaced,
  startPaced as beginPaced,
  touchProgress,
  moduleById,
  modulesForClasses,
  orderLessons,
  progressIn,
  lessonResponses,
  lessonReleased,
  releaseLesson,
  releasesOf,
  publishedLessons,
  quietLessons,
  recordProgress,
  recordRun,
  recordWatch,
  responsesOf,
  responsesTo,
  runCounts,
  runsOf,
  removeLesson as tombstoneLesson,
  setLessonSounds,
  setModuleAudiences,
  setModuleClasses,
  audienceOfClass,
  audiencesOf,
  moduleReaches,
  setModuleState,
  standingsIn,
  studentModules,
  updateLesson,
  updateModule,
  answersToMark,
  codesOf,
  decideShare as decideOffered,
  keepProject as keepOwnProject,
  offerShare as offerProject,
  projectsOf,
  projectsSince,
  sharesOf,
  shownWith,
  studiosSince,
  withdrawShare as withdrawProject,
  watchesOf,
  watchRowsIn,
} from "@faridalms/database/stores/learning";
import { columnScores, columnsOf } from "@faridalms/database/stores/lti";
import { localeOf } from "@faridalms/database/stores/preferences";
import {
  judgementsOf,
  recordEvidence,
  standardsByIds,
} from "@faridalms/database/stores/standards";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { gridOwners } from "@faridalms/database/stores/timetable";
import {
  reviewTranslation,
  translationReview,
} from "@faridalms/database/stores/translations";
import { schoolYears, workingYear } from "@faridalms/database/stores/years";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  checkBlocks,
  checkStates,
  completionMet,
  bandFor,
  describeCheck,
  describeReview,
  remarksOf,
  changedPrograms,
  feedbackAtOf,
  feedbackOpen,
  heldChecks,
  copyLessonSchema,
  duplicateModuleSchema,
  autoBlocks,
  isAuto,
  isTeacherMarked,
  lessonContentOf,
  lessonIssue,
  lessonMedia,
  lessonWatchables,
  lessonRecordings,
  lessonScore,
  lessonParts,
  lessonPlainText,
  lessonScored,
  markResponse,
  markSchema,
  readingWords,
  moduleRefSchema,
  moveLessonSchema,
  readLessonInSchema,
  overrideSchema,
  paceSchema,
  partOf,
  pathOf,
  planSchema,
  positionSchema,
  prerequisiteMet,
  progressQuerySchema,
  publishModuleSchema,
  classSoundsSchema,
  keepCodeSchema,
  decideShareSchema,
  galleryItemSchema,
  galleryRefSchema,
  keepProjectSchema,
  respondProgramSchema,
  respondSchema,
  setClassSoundsSchema,
  reviewBlocks,
  responseFiles,
  ownResponse,
  responseIssue,
  responseSchema,
  revealSchema,
  runnableCode,
  runSchema,
  runsQuerySchema,
  saveLessonSchema,
  saveModuleSchema,
  releaseSchema,
  startPacedSchema,
  savePlanSchema,
  settled,
  shortOfGate,
  standingOf,
  studentBlocks,
  upgradeLesson,
  videoStops,
  watchSchema,
} from "@faridalms/domain/learning";
import { isContentDocument } from "@faridalms/domain/lesson-content";
import { translatedLesson } from "@faridalms/domain/lesson-translation";
import { LIVE_WINDOW_MS, liveStates } from "@faridalms/domain/live";
import {
  PRACTICE_LEAST,
  practiceCheckSchema,
  practiceItems,
  practiceSetSchema,
  practiceView,
} from "@faridalms/domain/practice";
import { heldAs, sameFiles } from "@faridalms/domain/project";
import { scratchReadingOf } from "@faridalms/domain/scratch-project";
import { questionStandards } from "@faridalms/domain/standards";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import { createHash } from "node:crypto";
import * as v from "valibot";

import type { SchoolContext, UnitContext } from "../core/context";

import { markedProgram } from "../coding/mark";
import { projectCode } from "../coding/scratch-file";
import { featuresOf } from "../core/features";
import {
  editableModule,
  mayEditModule,
  moduleOfSchool,
} from "../core/learning-access";
import {
  audit,
  can,
  openUnit,
  readProcedure as anyRead,
  requireCapability,
  schoolProcedure,
  writeProcedure as anyWrite,
} from "../core/procedure";
import { applyRemarks } from "../core/remarks";
import {
  registerArea,
  registerHostReader,
  registerHostWriter,
  registerLiveRules,
  placeMedia,
} from "../files/authorize";
import { resultOf } from "../lti/grades";

const id = v.pipe(v.string(), v.uuid());

async function isOn(context: UnitContext) {
  return (await featuresOf(context)).elearning;
}

async function switchedOn(context: UnitContext) {
  if (!(await isOn(context)))
    throw new ORPCError("CONFLICT", { message: "learning.disabled" });
}

/** Learning answers only in schools that have switched it on. */
const readProcedure = anyRead.use(async ({ context, next }) => {
  await switchedOn(context);
  return next();
});
const writeProcedure = anyWrite.use(async ({ context, next }) => {
  await switchedOn(context);
  return next();
});

const scopeOf = (context: UnitContext) => ({
  tenantId: context.tenantId,
  schoolId: context.schoolId,
  today: context.today,
  viewerId: context.actor.userId,
  schoolWide: can(context, "classes:manage"),
});

async function currentYear(context: UnitContext) {
  const year = workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
  if (!year) throw new ORPCError("CONFLICT", { message: "learning.no_year" });
  return year;
}

/** The classes the viewer may set modules for this year. */
async function authoringClasses(context: UnitContext) {
  const year = await currentYear(context);
  if (can(context, "classes:manage")) {
    const rows = await gridOwners(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
    });
    return { year, classes: rows };
  }
  const rows = await classesTaughtBy(context.tx, context, {
    userId: context.actor.userId,
    yearId: year.id,
    on: context.today,
  });
  return {
    year,
    classes: rows.map((row) => ({
      id: row.id,
      code: row.code,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
    })),
  };
}

const isOpen = (row: ModuleRow, now: Date) =>
  row.state === "published" &&
  row.publishAt !== null &&
  Date.parse(row.publishAt) <= now.getTime();

/**
 * The student whose modules the viewer reads: themselves, or a child they
 * may see. Anyone else is not found.
 */
async function learner(context: UnitContext, studentId: string) {
  const target = studentId || context.actor.userId;
  if (target === context.actor.userId) {
    requireCapability(context, "learning:read");
    return { studentId: target, own: true };
  }
  requireCapability(context, "children:read");
  if (!(await isVisibleStudent(context.tx, scopeOf(context), target)))
    throw new ORPCError("NOT_FOUND");
  return { studentId: target, own: false };
}

async function classesOfStudent(context: UnitContext, studentId: string) {
  const reach = await reachOf(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    userId: studentId,
    on: context.today,
  });
  return reach.classIds;
}

/**
 * A module open to the student, or not found; with whether its prerequisite
 * still locks it, and how the student stands in that prerequisite.
 */
async function openModule(
  context: UnitContext,
  moduleId: string,
  studentId: string,
) {
  const row = await moduleOfSchool(context, moduleId);
  if (!isOpen(row, context.now)) throw new ORPCError("NOT_FOUND");
  if (
    !(await moduleReaches(context.tx, {
      tenantId: context.tenantId,
      moduleId: row.id,
      studentId,
      classIds: await classesOfStudent(context, studentId),
    }))
  )
    throw new ORPCError("NOT_FOUND");
  const before = row.prerequisiteId
    ? ((
        await standingsIn(context.tx, {
          tenantId: context.tenantId,
          moduleIds: [row.prerequisiteId],
          studentId,
        })
      ).get(row.prerequisiteId) ?? null)
    : null;
  return {
    row,
    locked: before !== null && !prerequisiteMet(before, row.prerequisiteScore),
    prerequisiteResult: before && {
      finished: before.finished,
      score: before.score,
    },
  };
}

/**
 * The version of a lesson students play: the last one published. Edits wait
 * in the draft until the teacher publishes them, so a question never changes
 * under an answer already given.
 */
async function publishedLesson(context: UnitContext, lessonId: string) {
  const document = await documentOf(context.tx, context.tenantId, {
    type: "lesson",
    id: lessonId,
  });
  if (!document) return null;
  const published = await publishedVersion(
    context.tx,
    context.tenantId,
    document.id,
  );
  const draft = await translationOf(context.tx, context.tenantId, document.id);
  const translated = draft
    ? await publishedVersion(context.tx, context.tenantId, draft.id)
    : null;
  return published
    ? {
        versionId: published.id,
        documentVersion: published.documentVersion,
        draftVersion: document.version,
        content: upgradeLesson(published.content),
        stored: published.content,
        /** The translation students read, as last published. */
        translation:
          draft?.locale &&
          translated &&
          isContentDocument(published.content) &&
          isContentDocument(translated.content)
            ? {
                locale: draft.locale,
                content: lessonContentOf(translated.content),
              }
            : null,
        /** The translation has edits students do not see yet. */
        translationChanged: draft
          ? !translated || draft.version > translated.documentVersion
          : false,
      }
    : null;
}

/** What stops a lesson as it is stored going in front of students. */
async function storedLessonIssue(
  context: UnitContext,
  lesson: { id: string; completion: LessonCompletion; young: boolean },
) {
  const document = await documentOf(context.tx, context.tenantId, {
    type: "lesson",
    id: lesson.id,
  });
  return lessonIssue({
    completion: lesson.completion,
    content: lessonContentOf(document?.content),
    young: lesson.young,
  });
}

async function publishLessons(context: UnitContext, lessonIds: string[]) {
  for (const lessonId of lessonIds) {
    const document = await documentOf(context.tx, context.tenantId, {
      type: "lesson",
      id: lessonId,
    });
    if (!document) continue;
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      userId: context.actor.userId,
    });
    const translation = await translationOf(
      context.tx,
      context.tenantId,
      document.id,
    );
    if (translation)
      await snapshotPublish(context.tx, {
        tenantId: context.tenantId,
        documentId: translation.id,
        userId: context.actor.userId,
      });
  }
}

const resultsOf = (cells: readonly ProgressRow[]) =>
  new Map<string, LessonResult>(
    cells.map((cell) => [
      cell.lessonId,
      { completed: cell.completedAt !== null, score: cell.score },
    ]),
  );

/**
 * The lessons on a student's path through a module, each done, open, or
 * locked behind an earlier one. Lessons their scores route them past, or
 * that wait on a lesson they have not finished, are left out.
 */
function outline(
  row: ModuleRow,
  lessons: Awaited<ReturnType<typeof lessonsOf>>,
  cells: readonly ProgressRow[],
  locked: boolean,
) {
  const results = resultsOf(cells);
  const path = pathOf(lessons, results);
  let blocked = locked;
  return lessons
    .filter((lesson) => path.get(lesson.id) === "on")
    .map((lesson) => {
      const done = results.get(lesson.id)?.completed ?? false;
      const state = done
        ? ("done" as const)
        : blocked
          ? ("locked" as const)
          : ("open" as const);
      if (row.sequential && !done) blocked = true;
      return { ...lesson, state };
    });
}

async function hostReadable(context: UnitContext, lessonId: string) {
  if (!(await isOn(context))) return false;
  const lesson = await lessonById(context.tx, context.tenantId, lessonId);
  if (!lesson) return false;
  const row = await moduleById(context.tx, context.tenantId, lesson.moduleId);
  if (!row || row.orgId !== context.schoolId) return false;
  if (await mayEditModule(context, row)) return true;
  try {
    await openModule(context, row.id, context.actor.userId);
    return true;
  } catch {
    return false;
  }
}

registerHostReader("lesson", hostReadable);

// A student's spoken answers and coding projects in a lesson: whoever
// teaches the lesson's module hears and opens them, as they read its
// written answers; the student has their own. A project its teacher has
// shown in a class gallery opens to the classmates the gallery is for.
registerHostReader("lesson_answer", async (context, lessonId, file) => {
  if (!(await isOn(context))) return false;
  const lesson = await lessonById(context.tx, context.tenantId, lessonId);
  if (!lesson) return false;
  const row = await moduleById(context.tx, context.tenantId, lesson.moduleId);
  if (!row || row.orgId !== context.schoolId) return false;
  if (await mayEditModule(context, row)) return true;
  return file ? shownToClassmate(context, lesson.id, file.id) : false;
});

async function editsModule(context: UnitContext, moduleId: string) {
  if (!(await isOn(context))) return false;
  const row = await moduleById(context.tx, context.tenantId, moduleId);
  return Boolean(
    row &&
    row.orgId === context.schoolId &&
    (await mayEditModule(context, row)),
  );
}

/**
 * A module's file area holds its lessons' pictures and recordings. Whoever
 * may edit the module reads all of it; students only what a lesson they may
 * open shows.
 */
registerArea("module", {
  reader: editsModule,
  writer: editsModule,
  holders: {
    lesson: async (context, lessonId) => {
      const lesson = await lessonById(context.tx, context.tenantId, lessonId);
      return lesson ? { type: "module", id: lesson.moduleId } : null;
    },
    module_plan: (_, moduleId) =>
      Promise.resolve({ type: "module", id: moduleId }),
  },
});

// A module's unit plan is for those who teach it, who write it together.
registerHostReader("module_plan", editsModule);
registerHostWriter("module_plan", editsModule);
registerLiveRules("module_plan", { keyed: () => Promise.resolve(false) });

const planHost = (moduleId: string) => ({ type: "module_plan", id: moduleId });

/**
 * A module's unit plan, and the standards its lessons' questions assess with
 * how many questions assess each, for the plan to be read against.
 */
export const plan = readProcedure
  .input(planSchema)
  .handler(async ({ input, context }) => {
    const owner = await editableModule(context, input.moduleId);
    const [stored, lessons] = await Promise.all([
      documentOf(context.tx, context.tenantId, planHost(owner.id)),
      lessonsOf(context.tx, context.tenantId, owner.id),
    ]);
    const contents = await contentsOf(
      context.tx,
      context.tenantId,
      "lesson",
      lessons.map((lesson) => lesson.id),
    );
    const tagged = questionStandards(
      [...contents.values()].map(lessonContentOf),
    );
    const assessed = await standardsByIds(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids: [...tagged.keys()],
    });
    return {
      content: stored ? (stored.content as unknown as ContentDocument) : null,
      assessed: assessed.map((row) => ({
        ...row,
        questions: tagged.get(row.id) ?? 0,
      })),
    };
  });

/** Stores a module's unit plan as written, where it is not written live. */
export const savePlan = writeProcedure
  .input(savePlanSchema)
  .handler(async ({ input, context }) => {
    const owner = await editableModule(context, input.moduleId);
    const host = planHost(owner.id);
    const saved = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(
        context,
        host,
        input.content,
        contentFileIds(input.content),
      )),
      plainText: contentPlainText(input.content),
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "module.plan",
      objectType: "learning_module",
      objectId: owner.id,
      details: {},
    });
    return { version: saved.version };
  });
registerLiveRules("lesson", {
  keyed: () => Promise.resolve(true),
  // A lesson still stored as a list of blocks is written as one document
  // before a room opens on it, since the room starts from stored content.
  prepare: async (context, lessonId) => {
    const host = { type: "lesson", id: lessonId };
    const stored = await documentOf(context.tx, context.tenantId, host);
    if (!stored || isContentDocument(stored.content)) return;
    const content = { ...lessonContentOf(stored.content) };
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "lesson",
      content,
      plainText: contentPlainText(content),
      mediaIds: contentFileIds(content),
      userId: context.actor.userId,
    });
  },
});
registerHostWriter("lesson", async (context, lessonId) => {
  if (!(await isOn(context))) return false;
  const lesson = await lessonById(context.tx, context.tenantId, lessonId);
  if (!lesson) return false;
  const row = await moduleById(context.tx, context.tenantId, lesson.moduleId);
  return Boolean(
    row &&
    row.orgId === context.schoolId &&
    (await mayEditModule(context, row)),
  );
});

/** The classes and modules a module editor offers. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "learning:author");
  const { classes } = await authoringClasses(context);
  const modules = await modulesForClasses(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    classIds: classes.map((item) => item.id),
    authorId: context.actor.userId,
  });
  return {
    classes,
    modules: modules.map((row) => ({ id: row.id, title: row.title })),
  };
});

/** The modules of the viewer's classes, for teaching. */
export const modules = readProcedure
  .input(v.object({ classId: v.optional(v.union([v.literal(""), id]), "") }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "learning:author");
    const { classes } = await authoringClasses(context);
    const classIds = input.classId
      ? classes
          .filter((item) => item.id === input.classId)
          .map((item) => item.id)
      : classes.map((item) => item.id);
    return {
      classes,
      rows: await modulesForClasses(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        classIds,
        authorId: input.classId ? null : context.actor.userId,
      }),
    };
  });

/** A module for those who teach it: its classes and lessons. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.id);
    const [classes, lessons, audiences] = await Promise.all([
      classesOfModule(context.tx, context.tenantId, row.id),
      lessonsOf(context.tx, context.tenantId, row.id),
      audiencesOf(context.tx, { tenantId: context.tenantId, moduleId: row.id }),
    ]);
    const contents = await contentsOf(
      context.tx,
      context.tenantId,
      "lesson",
      lessons.map((lesson) => lesson.id),
    );
    return {
      ...row,
      classes,
      // Whether each lesson has a score that a later one can depend on.
      lessons: lessons.map((lesson) => ({
        ...lesson,
        scored: lessonScored(lessonContentOf(contents.get(lesson.id))),
      })),
      audiences,
      open: isOpen(row, context.now),
    };
  });

/**
 * The groups and students a teacher chose in each class, kept to those of
 * that class: groups made in it, and students on its roster.
 */
async function checkedAudiences(
  context: UnitContext,
  input: {
    classIds: readonly string[];
    audiences: readonly ModuleAudienceRow[];
  },
) {
  return Promise.all(
    input.audiences
      .filter((row) => input.classIds.includes(row.classId))
      .map(async (row) => {
        const [roster, groups] = await Promise.all([
          rosterOf(context.tx, context.tenantId, row.classId, context.today),
          groupsOf(context.tx, context.tenantId, row.classId),
        ]);
        const own = new Set(groups.map((group) => group.id));
        if (
          row.groupIds.some((groupId) => !own.has(groupId)) ||
          row.studentIds.some((studentId) => !roster.includes(studentId))
        )
          throw new ORPCError("BAD_REQUEST", { message: "learning.audience" });
        return {
          classId: row.classId,
          groupIds: [...new Set(row.groupIds)],
          studentIds: [...new Set(row.studentIds)],
        };
      }),
  );
}

/** Of a class's roster today, the students a module set for it reaches. */
async function audienceOf(
  context: UnitContext,
  moduleId: string,
  classId: string,
) {
  return audienceOfClass(context.tx, {
    tenantId: context.tenantId,
    moduleId,
    classId,
    roster: await rosterOf(
      context.tx,
      context.tenantId,
      classId,
      context.today,
    ),
  });
}

export const saveModule = writeProcedure
  .input(saveModuleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "learning:author");
    const { year, classes } = await authoringClasses(context);
    const allowed = new Set(classes.map((item) => item.id));
    if (input.classIds.some((classId) => !allowed.has(classId)))
      throw new ORPCError("FORBIDDEN", { message: "learning.class" });
    const prerequisiteId = input.prerequisiteId || null;
    if (prerequisiteId) {
      const before = await moduleOfSchool(context, prerequisiteId);
      if (before.id === input.id || before.prerequisiteId === input.id)
        throw new ORPCError("BAD_REQUEST", {
          message: "learning.prerequisite",
        });
    }
    const fields = {
      title: input.title,
      summary: input.summary,
      sequential: input.sequential,
      prerequisiteId,
      prerequisiteScore: prerequisiteId ? input.prerequisiteScore : null,
      practiceBands: input.practiceBands,
    };
    let moduleId = input.id;
    let version: number;
    if (input.id) {
      await editableModule(context, input.id);
      const next = await updateModule(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      version = next;
    } else {
      const created = await insertModule(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
        authorId: context.actor.userId,
        ...fields,
      });
      moduleId = created.id;
      version = created.version;
    }
    await setModuleClasses(context.tx, {
      tenantId: context.tenantId,
      moduleId,
      classIds: input.classIds,
    });
    await setModuleAudiences(context.tx, {
      tenantId: context.tenantId,
      moduleId,
      audiences: await checkedAudiences(context, input),
    });
    await audit(context, {
      action: input.id ? "module.update" : "module.create",
      objectType: "learning_module",
      objectId: moduleId,
      details: { title: input.title, classes: input.classIds.length },
    });
    return { id: moduleId, version };
  });

/** Opens a module to its classes now or at a set time; it needs a lesson with something in it. */
export const publishModule = writeProcedure
  .input(publishModuleSchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.id);
    const lessons = await lessonsOf(context.tx, context.tenantId, row.id);
    if (lessons.length === 0)
      throw new ORPCError("CONFLICT", { message: "learning.lesson_required" });
    for (const lesson of lessons) {
      const issue = await storedLessonIssue(context, lesson);
      if (issue) throw new ORPCError("CONFLICT", { message: issue });
    }
    const version = await setModuleState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "published",
      publishAt: input.publishAt || context.now.toISOString(),
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await publishLessons(
      context,
      lessons.map((lesson) => lesson.id),
    );
    await audit(context, {
      action: "module.publish",
      objectType: "learning_module",
      objectId: row.id,
      details: { publishAt: input.publishAt || null },
    });
    return { version };
  });

/** Takes a module back to draft; students keep their progress for when it returns. */
export const unpublishModule = writeProcedure
  .input(moduleRefSchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.id);
    const version = await setModuleState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "draft",
      publishAt: null,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "module.unpublish",
      objectType: "learning_module",
      objectId: row.id,
    });
    return { version };
  });

export const archiveModule = writeProcedure
  .input(moduleRefSchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.id);
    const version = await setModuleState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "archived",
      publishAt: row.publishAt ?? context.now.toISOString(),
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "module.archive",
      objectType: "learning_module",
      objectId: row.id,
    });
    return { version };
  });

/** A draft copy of a module and its lessons for other classes. */
/**
 * A lesson copied to the end of a module: its settings and document, the
 * pictures and recordings in it copied into that module's keeping. It
 * starts unshown, whatever the lesson it came from.
 */
async function copyLesson(
  context: UnitContext,
  lesson: LessonRow,
  moduleId: string,
  condition: LessonCondition | null = null,
) {
  const copy = await insertLesson(context.tx, {
    tenantId: context.tenantId,
    moduleId,
    title: lesson.title,
    completion: lesson.completion,
    passScore: lesson.passScore,
    review: lesson.review,
    vowelMarks: lesson.vowelMarks,
    language: lesson.language,
    translationTitle: lesson.translationTitle,
    young: lesson.young,
    bands: lesson.bands,
    readAlong: lesson.readAlong,
    condition,
  });
  const stored = await documentOf(context.tx, context.tenantId, {
    type: "lesson",
    id: lesson.id,
  });
  const content = { ...lessonContentOf(stored?.content) };
  const host = { type: "lesson", id: copy.id };
  const original = await saveDocument(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    host,
    kind: "lesson",
    ...(await placeMedia(context, host, content, contentFileIds(content))),
    plainText: contentPlainText(content),
    userId: context.actor.userId,
  });
  const translation = stored
    ? await translationOf(context.tx, context.tenantId, stored.id)
    : null;
  if (translation?.locale) {
    const words = { ...lessonContentOf(translation.content) };
    await saveTranslation(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      originalId: original.id,
      locale: translation.locale,
      kind: "lesson",
      ...(await placeMedia(context, host, words, contentFileIds(words))),
      plainText: contentPlainText(words),
      userId: context.actor.userId,
    });
  }
  return copy;
}

/** Copies a lesson to the end of a module its teacher writes, this one or another. */
export const copyLessonTo = writeProcedure
  .input(copyLessonSchema)
  .handler(async ({ input, context }) => {
    const lesson = await lessonById(context.tx, context.tenantId, input.id);
    if (!lesson) throw new ORPCError("NOT_FOUND");
    await editableModule(context, lesson.moduleId);
    const target = await editableModule(context, input.moduleId);
    const copy = await copyLesson(context, lesson, target.id);
    await audit(context, {
      action: "lesson.copy",
      objectType: "lesson",
      objectId: copy.id,
      details: { from: lesson.id, moduleId: target.id },
    });
    return { id: copy.id };
  });

export const duplicateModule = writeProcedure
  .input(duplicateModuleSchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.id);
    const { year, classes } = await authoringClasses(context);
    const allowed = new Set(classes.map((item) => item.id));
    if (input.classIds.some((classId) => !allowed.has(classId)))
      throw new ORPCError("FORBIDDEN", { message: "learning.class" });
    const created = await insertModule(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      authorId: context.actor.userId,
      title: row.title,
      summary: row.summary,
      sequential: row.sequential,
      prerequisiteId: null,
      prerequisiteScore: null,
      practiceBands: row.practiceBands,
    });
    await setModuleClasses(context.tx, {
      tenantId: context.tenantId,
      moduleId: created.id,
      classIds: input.classIds,
    });
    // A condition depends on an earlier lesson, copied by the time it is read.
    const copies = new Map<string, string>();
    for (const lesson of await lessonsOf(
      context.tx,
      context.tenantId,
      row.id,
    )) {
      const before = lesson.condition && copies.get(lesson.condition.lessonId);
      const copy = await copyLesson(
        context,
        lesson,
        created.id,
        lesson.condition && before
          ? { ...lesson.condition, lessonId: before }
          : null,
      );
      copies.set(lesson.id, copy.id);
    }
    // A unit taught again starts from the plan it was taught by.
    const unitPlan = await documentOf(
      context.tx,
      context.tenantId,
      planHost(row.id),
    );
    if (unitPlan) {
      const content = { ...(unitPlan.content as unknown as ContentDocument) };
      const host = planHost(created.id);
      await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        ...(await placeMedia(context, host, content, contentFileIds(content))),
        plainText: contentPlainText(content),
        userId: context.actor.userId,
      });
    }
    await audit(context, {
      action: "module.duplicate",
      objectType: "learning_module",
      objectId: created.id,
      details: { from: row.id },
    });
    return created;
  });

/** A lesson with its blocks and answers, for those who teach its module. */
export const lesson = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    const published = await publishedLesson(context, row.id);
    const document = await documentOf(context.tx, context.tenantId, {
      type: "lesson",
      id: row.id,
    });
    const translation = document
      ? await translationOf(context.tx, context.tenantId, document.id)
      : null;
    return {
      ...row,
      module: { id: owner.id, title: owner.title, state: owner.state },
      content: lessonContentOf(document?.content),
      translation: translation && {
        title: row.translationTitle ?? "",
        content: lessonContentOf(translation.content),
      },
      translationReview: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "lesson",
        id: row.id,
      }),
      published: published
        ? {
            documentVersion: published.documentVersion,
            changed:
              published.draftVersion > published.documentVersion ||
              published.translationChanged,
            content: lessonContentOf(published.stored),
            translation: published.translation?.content ?? null,
          }
        : null,
    };
  });

/**
 * Records that a lesson's translation was checked against the original as
 * it now reads, or takes the check back.
 */
export const reviewLessonTranslation = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    await editableModule(context, row.moduleId);
    if (row.version !== input.expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const document = await documentOf(context.tx, context.tenantId, {
      type: "lesson",
      id: row.id,
    });
    const translation = document
      ? await translationOf(context.tx, context.tenantId, document.id)
      : null;
    if (
      input.reviewed &&
      !documentWritten(
        translation ? lessonContentOf(translation.content) : null,
      )
    )
      throw new ORPCError("CONFLICT", {
        message: "learning.nothing_to_check",
      });
    const version = await reviewTranslation(context.tx, {
      host: "lesson",
      tenantId: context.tenantId,
      id: row.id,
      userId: context.actor.userId,
      reviewed: input.reviewed,
    });
    await audit(context, {
      action: input.reviewed
        ? "lesson.translation_checked"
        : "lesson.translation_unchecked",
      objectType: "lesson",
      objectId: row.id,
    });
    return {
      version: version ?? row.version,
      review: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "lesson",
        id: row.id,
      }),
    };
  });

/** Puts a lesson's edits in front of its students. */
/**
 * The answers a lesson's questions would mark differently under the keys
 * of this document, each with its new mark, by student.
 */
async function remarksIn(
  context: UnitContext,
  lessonId: string,
  content: LessonDocument,
) {
  const rows = await lessonResponses(context.tx, {
    tenantId: context.tenantId,
    lessonId,
  });
  const changes: {
    studentId: string;
    attempt: number;
    block: CheckBlock;
    try: number;
    fraction: number;
  }[] = [];
  const sittings = Map.groupBy(
    rows,
    (row) => `${row.studentId}:${row.attempt}`,
  );
  for (const sitting of sittings.values()) {
    const [first] = sitting;
    if (!first) continue;
    for (const block of checkBlocks(content).filter(isAuto))
      for (const change of remarksOf(block, sitting))
        changes.push({
          studentId: first.studentId,
          attempt: first.attempt,
          block,
          ...change,
        });
  }
  return { rows, changes };
}

/**
 * Marks earlier answers again under a lesson's keys as now shown, as its
 * teacher chose. Code is run again by a background pass, asked for here for
 * each exercise whose tests changed since the version shown before.
 */
async function remarkLesson(
  context: UnitContext,
  shown: LessonRow,
  before: LessonDocument | null,
) {
  const published = await publishedLesson(context, shown.id);
  if (!published) return 0;
  const { rows, changes } = await remarksIn(
    context,
    shown.id,
    published.content,
  );
  for (const block of before ? changedPrograms(before, published.content) : [])
    await queueProgramRemark(context.tx, {
      tenantId: context.tenantId,
      lessonId: shown.id,
      blockId: block.id,
      documentVersionId: published.versionId,
      userId: context.actor.userId,
    });
  return applyRemarks(context, shown, published, rows, changes);
}

/** How many earlier answers the lesson as now written would mark differently, before its teacher shows it. */
export const remarking = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    await editableModule(context, row.moduleId);
    const [document, published] = await Promise.all([
      documentOf(context.tx, context.tenantId, { type: "lesson", id: row.id }),
      publishedLesson(context, row.id),
    ]);
    const draft = upgradeLesson(document?.content);
    const { rows, changes } = await remarksIn(context, row.id, draft);
    const rerun = new Set(
      (published ? changedPrograms(published.content, draft) : []).map(
        (block) => block.id,
      ),
    );
    return {
      answers: changes.length,
      students: new Set(changes.map((change) => change.studentId)).size,
      /** Code answers that would be run again against changed tests. */
      programs: rows.filter(
        (item) => item.state === "answered" && rerun.has(item.blockId),
      ).length,
    };
  });

export const publishLesson = writeProcedure
  .input(v.object({ id, remark: v.optional(v.boolean(), false) }))
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    if (owner.state !== "published")
      throw new ORPCError("CONFLICT", { message: "learning.module_draft" });
    const issue = await storedLessonIssue(context, row);
    if (issue) throw new ORPCError("CONFLICT", { message: issue });
    const shownBefore = await publishedLesson(context, row.id);
    await publishLessons(context, [row.id]);
    const remarked = input.remark
      ? await remarkLesson(context, row, shownBefore?.content ?? null)
      : 0;
    await audit(context, {
      action: "lesson.publish",
      objectType: "lesson",
      objectId: row.id,
      details: { remarked },
    });
    return { published: true };
  });

/**
 * A condition a lesson is saved with: on a scored lesson before it in the
 * same module. One kept as it was is not checked again, so a lesson whose
 * condition has since lost its questions still saves.
 */
async function checkedCondition(
  context: UnitContext,
  moduleId: string,
  stored: LessonRow | null,
  condition: LessonCondition | null,
) {
  if (!condition || condition.lessonId === stored?.condition?.lessonId)
    return condition;
  const lessons = await lessonsOf(context.tx, context.tenantId, moduleId);
  const at = stored
    ? lessons.findIndex((item) => item.id === stored.id)
    : lessons.length;
  const before = lessons.findIndex((item) => item.id === condition.lessonId);
  if (before === -1 || before >= at)
    throw new ORPCError("BAD_REQUEST", { message: "learning.condition_order" });
  const document = await documentOf(context.tx, context.tenantId, {
    type: "lesson",
    id: condition.lessonId,
  });
  if (!lessonScored(lessonContentOf(document?.content)))
    throw new ORPCError("BAD_REQUEST", {
      message: "learning.condition_unscored",
    });
  return condition;
}

export const saveLesson = writeProcedure
  .input(saveLessonSchema)
  .handler(async ({ input, context }) => {
    const owner = await editableModule(context, input.moduleId);
    const stored = input.id
      ? await lessonById(context.tx, context.tenantId, input.id)
      : null;
    if (input.id && (!stored || stored.moduleId !== owner.id))
      throw new ORPCError("NOT_FOUND");
    const before = stored
      ? await documentOf(context.tx, context.tenantId, {
          type: "lesson",
          id: stored.id,
        })
      : null;
    const translated = before
      ? await translationOf(context.tx, context.tenantId, before.id)
      : null;
    const translation =
      input.translation === undefined
        ? translated && {
            title: stored?.translationTitle ?? "",
            content: lessonContentOf(translated.content),
          }
        : input.translation;
    // A translation is in the other language of the lesson's own, which
    // stays as it is while the translation is kept.
    if (
      translation &&
      (!input.language ||
        (translated?.locale && translated.locale === input.language))
    )
      throw new ORPCError("CONFLICT", {
        message: "learning.translation_language",
      });
    const fields = {
      title: input.title,
      completion: input.completion,
      passScore: input.passScore,
      review: input.review,
      vowelMarks: input.vowelMarks,
      language: input.language,
      translationTitle: translation?.title || null,
      young: input.young,
      readAlong: input.readAlong,
      bands: input.bands,
      condition: await checkedCondition(
        context,
        owner.id,
        stored,
        input.condition,
      ),
    };
    let lessonId = input.id;
    let version: number;
    if (stored) {
      const next = await updateLesson(context.tx, {
        tenantId: context.tenantId,
        id: stored.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      version = next;
    } else {
      const created = await insertLesson(context.tx, {
        tenantId: context.tenantId,
        moduleId: owner.id,
        ...fields,
      });
      lessonId = created.id;
      version = created.version;
    }
    const host = { type: "lesson", id: lessonId };
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "lesson",
      ...(await placeMedia(
        context,
        host,
        input.content,
        contentFileIds(input.content),
      )),
      plainText: contentPlainText(input.content),
      userId: context.actor.userId,
    });
    if (input.translation !== undefined) {
      if (input.translation && input.language)
        await saveTranslation(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host,
          originalId: original.id,
          locale: otherLocale(input.language),
          kind: "lesson",
          ...(await placeMedia(
            context,
            host,
            input.translation.content,
            contentFileIds(input.translation.content),
          )),
          plainText: contentPlainText(input.translation.content),
          userId: context.actor.userId,
        });
      else
        await dropTranslation(context.tx, {
          tenantId: context.tenantId,
          originalId: original.id,
        });
      // A check lapses by itself once the original's words change; a
      // translation rewritten, or dropped, needs checking again.
      if (
        !input.translation ||
        contentPlainText(input.translation.content) !==
          (translated?.plainText ?? "")
      ) {
        const cleared = await reviewTranslation(context.tx, {
          host: "lesson",
          tenantId: context.tenantId,
          id: lessonId,
          userId: context.actor.userId,
          reviewed: false,
        });
        if (cleared !== null) version = cleared;
      }
    }
    await audit(context, {
      action: input.id ? "lesson.update" : "lesson.create",
      objectType: "lesson",
      objectId: lessonId,
      details: { moduleId: owner.id, title: input.title },
    });
    const published = input.publish && owner.state === "published";
    if (published) {
      const issue = lessonIssue(input);
      if (issue) throw new ORPCError("CONFLICT", { message: issue });
      const shownBefore = await publishedLesson(context, lessonId);
      await publishLessons(context, [lessonId]);
      const shownRow = input.remark
        ? await lessonById(context.tx, context.tenantId, lessonId)
        : null;
      const remarked = shownRow
        ? await remarkLesson(context, shownRow, shownBefore?.content ?? null)
        : 0;
      await audit(context, {
        action: "lesson.publish",
        objectType: "lesson",
        objectId: lessonId,
        details: { remarked },
      });
    }
    return {
      id: lessonId,
      version,
      published,
      review: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "lesson",
        id: lessonId,
      }),
    };
  });

export const moveLesson = writeProcedure
  .input(moveLessonSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    const lessons = await lessonsOf(context.tx, context.tenantId, owner.id);
    const order = lessons
      .map((item) => item.id)
      .filter((lessonId) => lessonId !== row.id);
    order.splice(Math.min(input.position, order.length), 0, row.id);
    // A lesson shown by a score stays after the lesson that sets the score.
    if (
      lessons.some(
        (item) =>
          item.condition &&
          order.indexOf(item.condition.lessonId) > order.indexOf(item.id),
      )
    )
      throw new ORPCError("CONFLICT", { message: "learning.condition_order" });
    await orderLessons(context.tx, {
      tenantId: context.tenantId,
      moduleId: owner.id,
      lessonIds: order,
    });
    return { moved: true };
  });

export const removeLesson = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    const lessons = await lessonsOf(context.tx, context.tenantId, owner.id);
    if (lessons.some((item) => item.condition?.lessonId === row.id))
      throw new ORPCError("CONFLICT", {
        message: "learning.condition_in_use",
      });
    await tombstoneLesson(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
    });
    await orderLessons(context.tx, {
      tenantId: context.tenantId,
      moduleId: owner.id,
      lessonIds: (await lessonsOf(context.tx, context.tenantId, owner.id)).map(
        (item) => item.id,
      ),
    });
    await audit(context, {
      action: "lesson.delete",
      objectType: "lesson",
      objectId: row.id,
      details: { moduleId: owner.id, title: row.title },
    });
    return { removed: true };
  });

/** Every student of a class against every lesson of a module. */
export const progress = readProcedure
  .input(progressQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      audienceOf(context, row.id, input.classId),
    ]);
    const [students, cells] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      progressIn(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        studentIds: roster,
      }),
    ]);
    // Where each student's path leaves a lesson out, or waits to decide.
    const paths = roster.flatMap((studentId) => {
      const path = pathOf(
        lessons,
        resultsOf(cells.filter((cell) => cell.studentUserId === studentId)),
      );
      return lessons.flatMap((item) => {
        const state = path.get(item.id);
        return state === "off" || state === "pending"
          ? [{ lessonId: item.id, studentId, state }]
          : [];
      });
    });
    const columns = await columnsOf(context.tx, {
      tenantId: context.tenantId,
      moduleId: row.id,
    });
    const scores = await columnScores(context.tx, {
      tenantId: context.tenantId,
      lineItemIds: columns.map((column) => column.id),
      studentIds: roster,
    });
    return {
      module: { id: row.id, title: row.title },
      classes,
      lessons,
      students,
      paths,
      tools: columns,
      toolScores: scores.flatMap((score) => {
        const column = columns.find((item) => item.id === score.lineItemId);
        return column
          ? [
              {
                lineItemId: score.lineItemId,
                studentId: score.studentUserId,
                result: resultOf(score, column),
                gradingProgress: score.gradingProgress,
              },
            ]
          : [];
      }),
      cells: cells.map((cell) => ({
        lessonId: cell.lessonId,
        studentId: cell.studentUserId,
        completedAt: cell.completedAt,
        completedBy: cell.completedBy,
        score: cell.score,
        attempts: cell.attempts,
      })),
    };
  });

/** Moments along a recording at which the class's watching is counted. */
const CURVE_POINTS = 60;

/**
 * How a class watched each recording in a module's published lessons, as
 * YouTube's audience retention shows a channel: how many students had
 * watched each moment, where the video stops for questions, and how much
 * of it each student has played.
 */
export const videos = readProcedure
  .input(progressQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      audienceOf(context, row.id, input.classId),
    ]);
    const [students, watches, published] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      watchRowsIn(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        studentIds: roster,
      }),
      Promise.all(lessons.map((item) => publishedLesson(context, item.id))),
    ]);
    const named = new Map(
      (
        await filesByIds(
          context.tx,
          context.tenantId,
          published.flatMap((found) =>
            found ? lessonMedia(found.content) : [],
          ),
        )
      ).map((file) => [file.id, file.name]),
    );
    const recordings = lessons.flatMap((item, index) => {
      const content = published[index]?.content;
      if (!content) return [];
      const stops = videoStops(content.blocks);
      return lessonRecordings(content).map((recording) => {
        const rows = watches.filter(
          (watch) =>
            watch.lessonId === item.id && watch.video === recording.key,
        );
        const duration = Math.max(
          0,
          ...rows.map((watch) => watch.durationSeconds),
        );
        // How many of the class played each moment, and how many went
        // back to play it again: the second peaks where they were lost.
        const across = (
          stretches: (watch: (typeof rows)[number]) => [number, number][],
        ) =>
          duration === 0
            ? []
            : Array.from({ length: CURVE_POINTS }, (_, point) => {
                const at = ((point + 0.5) / CURVE_POINTS) * duration;
                return rows.filter((watch) =>
                  stretches(watch).some(
                    ([start, end]) => start <= at && at < end,
                  ),
                ).length;
              });
        const curve = across((watch) => watch.ranges);
        const again = across((watch) => watch.replayed);
        return {
          lessonId: item.id,
          lessonTitle: item.title,
          key: recording.key,
          name: recording.name || named.get(recording.key) || "",
          video: recording.video,
          durationSeconds: duration || null,
          stops: (stops.get(recording.key) ?? []).map((stop) => stop.at),
          curve,
          again,
          watched: Object.fromEntries(
            rows.map((watch) => [
              watch.studentId,
              watch.ranges.reduce((sum, [start, end]) => sum + end - start, 0),
            ]),
          ),
        };
      });
    });
    return { students, recordings };
  });

/**
 * Where each student of a class is in the module right now, for the
 * teacher in the room: one state apiece, from the last twenty minutes.
 */
export const live = readProcedure
  .input(progressQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const now = Date.now();
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      audienceOf(context, row.id, input.classId),
    ]);
    const recent = {
      tenantId: context.tenantId,
      lessonIds: lessons.map((item) => item.id),
      studentIds: roster,
      since: new Date(now - LIVE_WINDOW_MS).toISOString(),
    };
    const [students, activity, building, saved] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      liveActivity(context.tx, recent),
      projectsSince(context.tx, recent),
      studiosSince(context.tx, recent),
    ]);
    const rows = liveStates({ studentIds: roster, ...activity, now });
    const open = [
      ...new Set([
        ...rows.flatMap((item) =>
          item.state !== "away" && item.lessonId ? [item.lessonId] : [],
        ),
        ...building.map((item) => item.lessonId),
        ...saved.map((item) => item.lessonId),
      ]),
    ];
    const published = await Promise.all(
      open.map((lessonId) => publishedLesson(context, lessonId)),
    );
    const questions = new Map(
      open.map((lessonId, index) => {
        const content = published[index]?.content;
        return [lessonId, content ? autoBlocks(content).length : 0];
      }),
    );
    return {
      now: new Date(now).toISOString(),
      lessons: lessons.map((item) => ({
        id: item.id,
        title: item.title,
        questions: questions.get(item.id) ?? 0,
      })),
      students,
      rows,
      // The projects being built, each as its student last left it, with
      // the question it answers; one a lesson no longer asks is left out.
      projects: building.flatMap((item) => {
        const content = published[open.indexOf(item.lessonId)]?.content;
        const block = content?.blocks.find(
          (candidate) => candidate.id === item.blockId,
        );
        return block?.type === "project"
          ? [{ ...item, prompt: block.prompt }]
          : [];
      }),
      // The coding projects saved in that time, each as last saved.
      studios: saved.flatMap((item) => {
        const content = published[open.indexOf(item.lessonId)]?.content;
        const block = content?.blocks.find(
          (candidate) => candidate.id === item.blockId,
        );
        return block?.type === "scratch"
          ? [{ ...item, prompt: block.prompt }]
          : [];
      }),
    };
  });

/** A lesson led live, with the module it is in and the version its students play. */
async function pacedFor(context: UnitContext, pacedId: string) {
  const session = await pacedById(context.tx, context.tenantId, pacedId);
  if (!session) throw new ORPCError("NOT_FOUND");
  const led = await lessonById(context.tx, context.tenantId, session.lessonId);
  if (!led) throw new ORPCError("NOT_FOUND");
  const owner = await editableModule(context, led.moduleId);
  const published = await publishedLesson(context, led.id);
  if (!published) throw new ORPCError("NOT_FOUND");
  return { session, led, owner, content: published.content };
}

/** A part named by its first words, for the teacher choosing where to take the class. */
function partLabel(blocks: LessonDocument["blocks"]) {
  const first =
    lessonPlainText({ version: 2, blocks })
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
}

/** Starts leading a lesson live for one of its module's classes, or rejoins the one running. */
export const startPaced = writeProcedure
  .input(startPacedSchema)
  .handler(async ({ input, context }) => {
    const led = await lessonById(context.tx, context.tenantId, input.lessonId);
    if (!led) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, led.moduleId);
    if (!isOpen(owner, context.now))
      throw new ORPCError("CONFLICT", { message: "learning.module_draft" });
    const classes = await classesOfModule(
      context.tx,
      context.tenantId,
      owner.id,
    );
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    if (!(await publishedLesson(context, led.id)))
      throw new ORPCError("CONFLICT", { message: "learning.paced_unshown" });
    const row = await beginPaced(context.tx, {
      tenantId: context.tenantId,
      lessonId: led.id,
      classId: input.classId,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "lesson.paced_start",
      objectType: "lesson",
      objectId: led.id,
      details: { classId: input.classId, pacedId: row.id },
    });
    return { id: row.id };
  });

/**
 * A lesson led live as its teacher's screen shows it: its parts and the
 * one open, who of the class is in it, and how they have answered the open
 * part's questions since it began. The class board reads the same and
 * leaves the names out.
 */
export const paced = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { session, led, owner, content } = await pacedFor(context, input.id);
    const roster = await audienceOf(context, owner.id, session.classId);
    const parts = lessonParts(content.blocks);
    const step = Math.min(session.step, parts.length - 1);
    const open = new Set((parts[step] ?? []).map((block) => block.id));
    const [classes, students, rows, activity, ran, releases] =
      await Promise.all([
        classesOfModule(context.tx, context.tenantId, owner.id),
        namesOf(context.tx, context.tenantId, roster),
        responsesSince(context.tx, {
          tenantId: context.tenantId,
          lessonId: led.id,
          studentIds: roster,
          since: session.startedAt,
        }),
        liveActivity(context.tx, {
          tenantId: context.tenantId,
          lessonIds: [led.id],
          studentIds: roster,
          since: session.startedAt,
        }),
        runCounts(context.tx, {
          tenantId: context.tenantId,
          lessonIds: [led.id],
          studentIds: roster,
        }),
        releasesOf(context.tx, {
          tenantId: context.tenantId,
          lessonIds: [led.id],
          classId: session.classId,
        }),
      ]);
    // Each student's latest attempt, should they have started over.
    const latest = new Map<string, number>();
    for (const row of rows)
      latest.set(
        row.studentId,
        Math.max(latest.get(row.studentId) ?? 0, row.attempt),
      );
    return {
      id: session.id,
      step,
      paused: session.paused,
      revealed: session.revealed,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lesson: {
        id: led.id,
        title: led.title,
        moduleId: owner.id,
        moduleTitle: owner.title,
      },
      class: classes.find((item) => item.id === session.classId) ?? null,
      parts: parts.map((part, index) => ({
        id: part[0]?.id ?? String(index),
        label: partLabel(part),
        questions: checkBlocks({ version: 2, blocks: part }).filter(isAuto)
          .length,
      })),
      students,
      joined: [
        ...new Set([
          ...activity.progress.map((item) => item.studentId),
          ...activity.tries.map((item) => item.studentId),
        ]),
      ],
      questions: questionsOf(
        content,
        rows.filter((row) => row.attempt === latest.get(row.studentId)),
        roster,
        ran,
      ).filter((question) => open.has(question.id)),
      release: releaseOf(content, releases),
    };
  });

/** The teacher takes the class to a part, pauses or resumes it, or shows the part's answers on the board. */
export const pace = writeProcedure
  .input(paceSchema)
  .handler(async ({ input, context }) => {
    const { session, content } = await pacedFor(context, input.id);
    if (session.endedAt)
      throw new ORPCError("CONFLICT", { message: "learning.paced_ended" });
    const step =
      input.step === undefined
        ? undefined
        : Math.min(input.step, lessonParts(content.blocks).length - 1);
    const row = await pacePaced(context.tx, {
      tenantId: context.tenantId,
      id: session.id,
      step,
      paused: input.paused,
      // A new part's answers wait to be shown until the teacher asks.
      revealed:
        input.revealed ??
        (step !== undefined && step !== session.step ? false : undefined),
    });
    if (!row)
      throw new ORPCError("CONFLICT", { message: "learning.paced_ended" });
    return { step: row.step, paused: row.paused, revealed: row.revealed };
  });

/** Ends a lesson led live; its students carry on at their own pace. */
export const endPaced = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { session, led } = await pacedFor(context, input.id);
    if (!session.endedAt)
      await pacePaced(context.tx, {
        tenantId: context.tenantId,
        id: session.id,
        ended: true,
      });
    await audit(context, {
      action: "lesson.paced_end",
      objectType: "lesson",
      objectId: led.id,
      details: { pacedId: session.id },
    });
    return { ended: true };
  });

/** Where a student's class is in a lesson its teacher leads live, asked again while they are in it. */
export const pacing = readProcedure
  .input(v.object({ lessonId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "learning:read");
    return {
      paced: await pacingOf(
        context,
        input.lessonId,
        await classesOfStudent(context, context.actor.userId),
      ),
    };
  });

/** A teacher marks a lesson done for a student, or takes that back. */
export const override = writeProcedure
  .input(overrideSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.lessonId);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    const classes = await classesOfModule(
      context.tx,
      context.tenantId,
      owner.id,
    );
    let enrolled = false;
    for (const item of classes)
      if (
        (await audienceOf(context, owner.id, item.id)).includes(input.studentId)
      )
        enrolled = true;
    if (!enrolled) throw new ORPCError("NOT_FOUND");
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      studentId: input.studentId,
      completed: input.completed ? { by: "teacher" } : null,
    });
    await audit(context, {
      action: input.completed ? "lesson.override" : "lesson.override_undo",
      objectType: "lesson",
      objectId: row.id,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
    });
    return { done: input.completed };
  });

/**
 * Whether each of a student's modules waits on its prerequisite, and how
 * they stand in that prerequisite. One they do not take keeps it locked.
 */
function withPrerequisites<
  T extends ModuleRow & { finished: boolean; score: number | null },
>(rows: readonly T[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    const before = row.prerequisiteId ? byId.get(row.prerequisiteId) : null;
    return {
      ...row,
      locked:
        row.prerequisiteId !== null &&
        !(before && prerequisiteMet(before, row.prerequisiteScore)),
      prerequisiteResult: before
        ? { finished: before.finished, score: before.score }
        : null,
    };
  });
}

/** A student's open modules and how far along they are; a family reads a child's. */
export const mine = readProcedure
  .input(v.object({ studentId: v.optional(v.union([v.literal(""), id]), "") }))
  .handler(async ({ input, context }) => {
    const { studentId } = await learner(context, input.studentId);
    const rows = await studentModules(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentId,
      classIds: await classesOfStudent(context, studentId),
    });
    return { rows: withPrerequisites(rows) };
  });

/**
 * What a young child does next: the next open lesson of each of their
 * modules, a lesson already begun first, so their home shows a few big
 * cards rather than a list of modules.
 */
export const nextLessons = readProcedure.handler(async ({ context }) => {
  const { studentId } = await learner(context, "");
  if (!(await isOn(context))) return { lessons: [] };
  const rows = await studentModules(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    studentId,
    classIds: await classesOfStudent(context, studentId),
  });
  const open = withPrerequisites(rows).filter(
    (row) => !row.finished && !row.locked,
  );
  const lessons = await Promise.all(
    open.map((row) => studentLessons(context, row.id)),
  );
  const cells = await progressIn(context.tx, {
    tenantId: context.tenantId,
    lessonIds: lessons.flat().map((item) => item.id),
    studentIds: [studentId],
  });
  const begun = new Set(cells.map((cell) => cell.lessonId));
  const found = open.flatMap((row, index) => {
    const next = outline(row, lessons[index] ?? [], cells, false).find(
      (item) => item.state === "open",
    );
    return next
      ? [
          {
            lessonId: next.id,
            title: next.title,
            moduleId: row.id,
            moduleTitle: row.title,
            begun: begun.has(next.id),
          },
        ]
      : [];
  });
  return {
    lessons: found
      .toSorted((a, b) => Number(b.begun) - Number(a.begun))
      .slice(0, 6),
  };
});

/** A teacher of the class, or someone who keeps the school's classes. */
async function soundKeeper(context: UnitContext, classId: string) {
  requireCapability(context, "learning:author", "classes:manage");
  if (!(await teachesClass(context.tx, scopeOf(context), classId)))
    throw new ORPCError("NOT_FOUND");
}

/** The lessons of a module a student has finished, for mixed review. */
async function finishedLessons(context: UnitContext, moduleId: string) {
  requireCapability(context, "learning:read");
  const studentId = context.actor.userId;
  const { row, locked } = await openModule(context, moduleId, studentId);
  if (locked) throw new ORPCError("NOT_FOUND");
  const lessons = await studentLessons(context, row.id);
  const cells = await progressIn(context.tx, {
    tenantId: context.tenantId,
    lessonIds: lessons.map((item) => item.id),
    studentIds: [studentId],
  });
  const done = new Set(
    cells.filter((cell) => cell.completedAt).map((cell) => cell.lessonId),
  );
  return {
    row,
    studentId,
    lessons: lessons.filter((item) => done.has(item.id)),
  };
}

/**
 * A mixed review of a module: questions from the lessons a student has
 * finished, the ones missed the first time first, lessons taking turns.
 * Only finished lessons give questions, so asking for an answer here never
 * hands over one a student has still to meet in a lesson.
 */
export const practiceSet = readProcedure
  .input(practiceSetSchema)
  .handler(async ({ input, context }) => {
    const { row, studentId, lessons } = await finishedLessons(
      context,
      input.moduleId,
    );
    const [published, firsts, quiet] = await Promise.all([
      Promise.all(lessons.map((item) => publishedLesson(context, item.id))),
      firstAttempts(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        studentIds: [studentId],
      }),
      quietLessons(context.tx, {
        tenantId: context.tenantId,
        moduleId: row.id,
        studentId,
        on: context.today,
      }),
    ]);
    const sources = lessons.flatMap((item, index) => {
      const content = published[index]?.content;
      return content
        ? [
            {
              lessonId: item.id,
              document: content,
              rows: firsts.filter((response) => response.lessonId === item.id),
            },
          ]
        : [];
    });
    const seed = `${studentId}:${context.today}:${input.round}`;
    const items = practiceItems(sources, seed);
    const lessonOf = new Map(lessons.map((item) => [item.id, item]));
    return {
      module: { id: row.id, title: row.title },
      /** What the student is told at the end, by the share they got right first time. */
      bands: row.practiceBands,
      young: lessons.length > 0 && lessons.every((item) => item.young),
      readAlong: lessons.every((item) => item.readAlong),
      sounds: !quiet,
      enough: items.length >= PRACTICE_LEAST,
      items: items.flatMap((item) => {
        const from = lessonOf.get(item.lessonId);
        const [block] = studentBlocks(
          { version: 2, blocks: [item.block] },
          `${seed}:${item.block.id}`,
        );
        return from && block
          ? [
              {
                lessonId: item.lessonId,
                lessonTitle: from.title,
                vowelMarks: from.vowelMarks,
                missed: item.missed,
                block,
                check: practiceView(item.block, 0, 0, null),
              },
            ]
          : [];
      }),
    };
  });

/** Marks one try at a mixed review question, or opens its next hint, keeping nothing. */
export const practiceCheck = readProcedure
  .input(practiceCheckSchema)
  .handler(async ({ input, context }) => {
    const asked = await lessonById(
      context.tx,
      context.tenantId,
      input.lessonId,
    );
    if (!asked) throw new ORPCError("NOT_FOUND");
    const { lessons } = await finishedLessons(context, asked.moduleId);
    if (!lessons.some((item) => item.id === asked.id))
      throw new ORPCError("NOT_FOUND");
    const content = (await publishedLesson(context, asked.id))?.content;
    const block = content
      ? autoBlocks(content).find((item) => item.id === input.blockId)
      : undefined;
    if (!block) throw new ORPCError("NOT_FOUND");
    const { answer } = input;
    if (
      answer.kind === "hint" &&
      practiceView(block, input.before, input.hints, null).askable === 0
    )
      throw new ORPCError("CONFLICT", { message: "learning.no_hint" });
    const shown = answer.kind === "hint" ? answer.last : null;
    const issue =
      answer.kind === "response"
        ? responseIssue(block, answer.response)
        : shown && responseIssue(block, shown);
    if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
    return practiceView(block, input.before, input.hints, answer);
  });

/**
 * A module's lessons as a student meets them: done, open or locked, the
 * unpublished and those off their path left out.
 */
export const play = readProcedure
  .input(
    v.object({ id, studentId: v.optional(v.union([v.literal(""), id]), "") }),
  )
  .handler(async ({ input, context }) => {
    const { studentId, own } = await learner(context, input.studentId);
    const { row, locked, prerequisiteResult } = await openModule(
      context,
      input.id,
      studentId,
    );
    const lessons = await studentLessons(context, row.id);
    const cells = await progressIn(context.tx, {
      tenantId: context.tenantId,
      lessonIds: lessons.map((item) => item.id),
      studentIds: [studentId],
    });
    return {
      ...row,
      locked,
      prerequisiteResult,
      own,
      lessons: outline(row, lessons, cells, locked),
    };
  });

/** A module's lessons that students can play: those with a published version. */
async function studentLessons(context: UnitContext, moduleId: string) {
  const lessons = await lessonsOf(context.tx, context.tenantId, moduleId);
  const published = await publishedLessons(
    context.tx,
    context.tenantId,
    lessons.map((item) => item.id),
  );
  return lessons.filter((item) => published.has(item.id));
}

async function playable(context: UnitContext, lessonId: string) {
  requireCapability(context, "learning:read");
  const row = await lessonById(context.tx, context.tenantId, lessonId);
  if (!row) throw new ORPCError("NOT_FOUND");
  const studentId = context.actor.userId;
  const { row: owner, locked } = await openModule(
    context,
    row.moduleId,
    studentId,
  );
  const lessons = await studentLessons(context, owner.id);
  const classIds = await classesOfStudent(context, studentId);
  const [cells, leading, released] = await Promise.all([
    progressIn(context.tx, {
      tenantId: context.tenantId,
      lessonIds: lessons.map((item) => item.id),
      studentIds: [studentId],
    }),
    pacingOf(context, row.id, classIds),
    lessonReleased(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      studentId,
      classIds,
    }),
  ]);
  const states = outline(owner, lessons, cells, locked);
  const state = states.find((item) => item.id === row.id)?.state;
  // A lesson the teacher is leading the class through opens to all of it,
  // whatever each student's order or path would say.
  if (state === undefined && !leading) throw new ORPCError("NOT_FOUND");
  if (state === "locked" && !leading)
    throw new ORPCError("CONFLICT", { message: "learning.locked" });
  const published = await publishedLesson(context, row.id);
  if (!published) throw new ORPCError("NOT_FOUND");
  const own = cells.find((cell) => cell.lessonId === row.id) ?? null;
  const attempt = own?.attempts ?? 1;
  // A student reads a translated lesson in the language they chose, else in
  // their own when the lesson has it. Its questions ask, and are marked, as
  // the original's are.
  const translation = published.translation;
  const reading = translation
    ? (own?.reading ??
      (await localeOf(context.tx, {
        tenantId: context.tenantId,
        userId: studentId,
      })))
    : null;
  const content =
    translation &&
    reading === translation.locale &&
    isContentDocument(published.stored)
      ? translatedLesson(published.stored, translation.content)
      : published.content;
  const shown: FeedbackShown = {
    end: Boolean(own?.resultsAt),
    teacher: released,
  };
  const rows = await responsesOf(context.tx, {
    tenantId: context.tenantId,
    lessonId: row.id,
    studentId,
    attempt,
  });
  return {
    row,
    owner,
    lessons,
    locked,
    states,
    studentId,
    own,
    attempt,
    rows,
    versionId: published.versionId,
    content,
    checks: checkStates(content, rows),
    paced: leading,
    shown,
    translation: translation && { locale: translation.locale },
    reading:
      translation && reading === translation.locale
        ? translation.locale
        : row.language,
  };
}

/** The part a student's class is being led through live in a lesson, if any. */
async function pacingOf(
  context: UnitContext,
  lessonId: string,
  classIds: readonly string[],
) {
  const row = await runningPaced(context.tx, {
    tenantId: context.tenantId,
    lessonId,
    classIds,
  });
  return row && { id: row.id, step: row.step, paused: row.paused };
}

/** Refuses an answer while the teacher leading a lesson has paused it, or in a part not yet open. */
function pacedAllows(played: Played, blockId: string) {
  if (!played.paced) return;
  if (played.paced.paused)
    throw new ORPCError("CONFLICT", { message: "learning.paced_paused" });
  if (partOf(played.content.blocks, blockId) > played.paced.step)
    throw new ORPCError("CONFLICT", { message: "learning.paced_ahead" });
}

type Played = Awaited<ReturnType<typeof playable>>;

/** How much of each of a lesson's recordings its student has played. */
async function watchedIn(
  context: UnitContext,
  played: Pick<Played, "row" | "studentId">,
): Promise<Record<string, WatchRow>> {
  const rows = await watchesOf(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    studentId: played.studentId,
  });
  return Object.fromEntries(rows.map((row) => [row.video, row]));
}

/** What a lesson's rule needs of its recordings: nothing unless it finishes on watching. */
const watchedFor = (context: UnitContext, played: Played) =>
  played.row.completion === "watch"
    ? watchedIn(context, played)
    : Promise.resolve({});

const viewOf = (
  block: CheckBlock,
  played: Pick<Played, "rows" | "checks" | "shown">,
) => describeCheck(block, played.rows, played.checks[block.id], played.shown);

/**
 * The score a student is told: none while any question still keeps how it
 * went from them, since a changing score would tell them.
 */
const toldScore = (
  played: Pick<Played, "content" | "shown">,
  score: number | null,
) => (heldChecks(played.content, played.shown).length > 0 ? null : score);

/**
 * The questions a lesson asks again once every one is settled, for lessons
 * that do, with how each went; nothing until then.
 */
function reviewOf(
  played: Pick<
    Played,
    "row" | "content" | "rows" | "checks" | "studentId" | "attempt"
  >,
) {
  if (!played.row.review) return null;
  const asked = reviewBlocks(played.content, played.checks);
  if (asked.length === 0) return null;
  return {
    blocks: studentBlocks(
      { version: 2, blocks: asked },
      `${played.studentId}:${played.attempt}:review`,
    ),
    checks: Object.fromEntries(
      asked.map((block) => [block.id, describeReview(block, played.rows)]),
    ),
  };
}

/** Recomputes a student's score from their attempt, keeping their best, and finishes the lesson when its rule is met. */
async function settle(context: UnitContext, played: Played) {
  const rows = await responsesOf(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    studentId: played.studentId,
    attempt: played.attempt,
  });
  const checks = checkStates(played.content, rows);
  const score = lessonScore(played.content, checks);
  // Measured against earlier attempts only: within one, showing an answer
  // may still lower the score.
  const best =
    score === null
      ? (played.own?.score ?? null)
      : Math.max(score, played.own?.bestScore ?? 0);
  const met = completionMet(
    played.row,
    played.content,
    checks,
    await watchedFor(context, played),
  );
  await recordProgress(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    studentId: played.studentId,
    score: best,
    ...(met ? { completed: { by: "student" as const } } : {}),
  });
  return {
    checks,
    score,
    best,
    completed: met || Boolean(played.own?.completedAt),
    rows,
  };
}

/** One lesson for its student: the published blocks without answers, and what they have done. */
export const playLesson = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.id);
    const { row, owner, states, own } = played;
    if (!own)
      await recordProgress(context.tx, {
        tenantId: context.tenantId,
        lessonId: row.id,
        studentId: played.studentId,
      });
    // Opening a lesson led live counts the student in.
    else if (played.paced)
      await touchProgress(context.tx, {
        tenantId: context.tenantId,
        lessonId: row.id,
        studentId: played.studentId,
      });
    const completed =
      row.completion === "view"
        ? (await settle(context, played)).completed
        : Boolean(own?.completedAt);
    // Finished by this opening, the lesson opens the next in a module taken
    // in order, which the outline read before it could not know.
    const outlined =
      completed && !own?.completedAt
        ? outline(
            owner,
            played.lessons,
            await progressIn(context.tx, {
              tenantId: context.tenantId,
              lessonIds: played.lessons.map((item) => item.id),
              studentIds: [played.studentId],
            }),
            played.locked,
          )
        : states;
    const index = outlined.findIndex((item) => item.id === row.id);
    return {
      ...row,
      module: { id: owner.id, title: owner.title },
      /** The other language the lesson can be read in, and its title there. */
      translation: played.translation && {
        locale: played.translation.locale,
        title: row.translationTitle ?? row.title,
      },
      /** The language the student reads the lesson in now. */
      reading: played.reading,
      blocks: studentBlocks(
        played.content,
        `${played.studentId}:${played.attempt}`,
      ),
      checks: Object.fromEntries(
        checkBlocks(played.content).map((block) => [
          block.id,
          viewOf(block, played),
        ]),
      ),
      review: reviewOf(played),
      attempt: played.attempt,
      completedAt: completed
        ? (own?.completedAt ?? context.now.toISOString())
        : null,
      score: toldScore(played, own?.score ?? null),
      /** What the lesson tells a student who has finished it, by their score. */
      band: completed
        ? (bandFor(row.bands, toldScore(played, own?.score ?? null))?.text ??
          null)
        : null,
      position: own?.position ?? null,
      watches: await watchedIn(context, played),
      codes: await ownCode(context, played),
      projects: await ownProjects(context, played),
      previous: outlined[index - 1]?.id ?? null,
      next:
        outlined[index + 1] && outlined[index + 1]?.state !== "locked"
          ? (outlined[index + 1]?.id ?? null)
          : null,
      index,
      total: outlined.length,
      paced: played.paced,
      sounds: !(await quietLessons(context.tx, {
        tenantId: context.tenantId,
        moduleId: owner.id,
        studentId: played.studentId,
        on: context.today,
      })),
      /** The student's arrangements give them a computer reader. */
      readAloud:
        (
          await arrangementsOf(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            studentId: played.studentId,
          })
        )?.arrangements.readAloud ?? false,
    };
  });

const digest = (source: string) =>
  createHash("sha256").update(source).digest("hex");

/**
 * A student's own versions of a lesson's runnable code blocks, each saying
 * whether the teacher has changed the block's code since the student began.
 */
async function ownCode(
  context: UnitContext,
  played: { row: { id: string }; studentId: string; content: LessonDocument },
) {
  const sources = runnableCode(played.content);
  const kept = await codesOf(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    studentId: played.studentId,
  });
  return Object.fromEntries(
    kept.flatMap((item) => {
      const source = sources.get(item.blockId);
      return source === undefined
        ? []
        : [
            [
              item.blockId,
              { code: item.code, changed: item.basedOn !== digest(source) },
            ],
          ];
    }),
  );
}

/**
 * A student chooses which of a translated lesson's two languages they read
 * it in; their answers stand in either.
 */
export const readLessonIn = writeProcedure
  .input(readLessonInSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    if (
      !played.translation ||
      (input.locale !== played.translation.locale &&
        input.locale !== played.row.language)
    )
      throw new ORPCError("BAD_REQUEST", { message: "learning.reading" });
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      reading: input.locale,
    });
    return { reading: input.locale };
  });

/**
 * A student changed a runnable code block, and their version is kept for
 * when they come back, with the teacher's code it began from.
 */
export const keepCode = writeProcedure
  .input(keepCodeSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const source = runnableCode(played.content).get(input.blockId);
    if (source === undefined) throw new ORPCError("NOT_FOUND");
    await keepOwnCode(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      blockId: input.blockId,
      code: input.code,
      basedOn: digest(source),
    });
    return { kept: true };
  });

/** The files each project question of a lesson starts its students from. */
const projectStarters = (content: LessonDocument) =>
  new Map(
    content.blocks.flatMap((block) =>
      block.type === "project" ? [[block.id, block.files] as const] : [],
    ),
  );

/**
 * A student's own projects in a lesson, each saying whether the teacher
 * has changed the question's starter since the student began.
 */
async function ownProjects(
  context: UnitContext,
  played: { row: { id: string }; studentId: string; content: LessonDocument },
) {
  const starters = projectStarters(played.content);
  const kept = await projectsOf(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    studentId: played.studentId,
  });
  return Object.fromEntries(
    kept.flatMap((item) => {
      const starter = starters.get(item.blockId);
      return starter === undefined
        ? []
        : [
            [
              item.blockId,
              {
                files: item.files,
                changed: item.basedOn !== digest(JSON.stringify(starter)),
              },
            ],
          ];
    }),
  );
}

/**
 * A student changed their project for a question, and it is kept for when
 * they come back; nothing reaches their teacher until they hand it in.
 */
export const keepProject = writeProcedure
  .input(keepProjectSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const starter = projectStarters(played.content).get(input.blockId);
    if (starter === undefined) throw new ORPCError("NOT_FOUND");
    await keepOwnProject(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      blockId: input.blockId,
      files: heldAs(starter, input.files),
      basedOn: digest(JSON.stringify(starter)),
      ...(input.fresh ? { remixedFrom: null } : {}),
    });
    return { kept: true };
  });

/** A lesson's project question whose students may show their work to the class. */
function galleryBlock(played: Played, blockId: string) {
  const block = played.content.blocks.find((item) => item.id === blockId);
  if (
    (block?.type !== "project" && block?.type !== "scratch") ||
    !block.gallery
  )
    throw new ORPCError("NOT_FOUND");
  return block;
}

/**
 * The students who share a class of a lesson's module with this one: those
 * whose projects they may see, and who may see theirs.
 */
async function classmatesOf(context: UnitContext, played: Played) {
  const classes = await classesOfModule(
    context.tx,
    context.tenantId,
    played.owner.id,
  );
  const rosters = await Promise.all(
    classes.map((item) => audienceOf(context, played.owner.id, item.id)),
  );
  return [
    ...new Set(
      rosters.filter((roster) => roster.includes(played.studentId)).flat(),
    ),
  ];
}

/** Whether a classmate's project for a question is in its class gallery now. */
async function shownBy(
  context: UnitContext,
  played: Played,
  blockId: string,
  studentId: string,
) {
  if (!(await classmatesOf(context, played)).includes(studentId)) return false;
  const [share] = await sharesOf(context.tx, {
    tenantId: context.tenantId,
    lessonIds: [played.row.id],
    studentIds: [studentId],
    blockId,
  });
  return share?.state === "shown";
}

/**
 * A project as it is taken for an answer, saying whose project in the
 * gallery it began from. A project of files is credited as the student's
 * kept copy knows, and nothing they sent to say so counts. A coding
 * project has no kept copy; its studio names the classmate as it saves,
 * which stands while that classmate's project is in the gallery, and
 * afterwards for as long as each save repeats what the last one said.
 */
async function credited(
  context: UnitContext,
  played: Played,
  block: { id: string; type: string; gallery?: boolean },
  response: LessonResponse,
): Promise<LessonResponse> {
  const own = ownResponse(response);
  if (own.type === "project") {
    const kept = await projectsOf(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
    });
    const from = kept.find((item) => item.blockId === block.id)?.remixedFrom;
    return from ? { ...own, remixOf: from } : own;
  }
  if (own.type !== "scratch" || response.type !== "scratch") return own;
  const from = response.remixOf;
  if (!from || from === played.studentId || !block.gallery) return own;
  const last = played.rows.findLast((row) => row.blockId === block.id);
  const before = last ? v.safeParse(responseSchema, last.response) : null;
  const carried =
    before?.success &&
    before.output.type === "scratch" &&
    before.output.remixOf === from;
  return carried || (await shownBy(context, played, block.id, from))
    ? { ...own, remixOf: from }
    : own;
}

/**
 * A coding answer saying what its project has and what in it is worth a
 * second look: read here from the saved file, which is the student's own
 * upload or is refused as the answer is kept.
 */
async function withFeatures(
  context: UnitContext,
  block: { type: string },
  response: LessonResponse,
): Promise<LessonResponse> {
  if (response.type !== "scratch" || block.type !== "scratch") return response;
  const [file] = await filesByIds(context.tx, context.tenantId, [
    response.project.fileId,
  ]);
  if (file?.uploadedByUserId !== context.actor.userId) return response;
  return {
    ...response,
    ...scratchReadingOf(await projectCode(context.files, file)),
  };
}

/**
 * Whether a file is a classmate's coding project in a class gallery this
 * student may look in: shown by their teacher, for a question the lesson
 * still asks with a gallery, once the student has saved a project of
 * their own.
 */
async function shownToClassmate(
  context: UnitContext,
  lessonId: string,
  fileId: string,
) {
  const shown = await shownWith(context.tx, {
    tenantId: context.tenantId,
    lessonId,
    fileId,
  });
  if (!shown) return false;
  let played: Played;
  try {
    played = await playable(context, lessonId);
  } catch {
    return false;
  }
  const block = played.content.blocks.find((item) => item.id === shown.blockId);
  return (
    block?.type === "scratch" &&
    block.gallery &&
    (played.checks[block.id]?.tries ?? 0) > 0 &&
    (await classmatesOf(context, played)).includes(shown.studentId)
  );
}

/**
 * A project question's class gallery for a student: how their own offer
 * stands, and, once they have handed in a project of their own, the
 * projects of classmates their teacher has shown. Who built on whose is
 * said by name.
 */
export const gallery = readProcedure
  .input(galleryRefSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    galleryBlock(played, input.blockId);
    const handedIn = (played.checks[input.blockId]?.tries ?? 0) > 0;
    const classmates = await classmatesOf(context, played);
    const shares = await sharesOf(context.tx, {
      tenantId: context.tenantId,
      lessonIds: [played.row.id],
      studentIds: classmates,
      blockId: input.blockId,
    });
    const own = shares.find((share) => share.studentId === played.studentId);
    const shown = handedIn
      ? shares.filter(
          (share) =>
            share.state === "shown" && share.studentId !== played.studentId,
        )
      : [];
    const parsed = shown.flatMap((share) => {
      const response = v.safeParse(responseSchema, share.response);
      return response.success &&
        (response.output.type === "project" ||
          response.output.type === "scratch")
        ? [{ studentId: share.studentId, project: response.output }]
        : [];
    });
    const people = await namesOf(context.tx, context.tenantId, [
      ...new Set(
        parsed.flatMap((item) => [
          item.studentId,
          ...(item.project.remixOf ? [item.project.remixOf] : []),
        ]),
      ),
    ]);
    const sent = played.rows.findLast(
      (row) =>
        row.blockId === input.blockId &&
        (row.state === "answered" || row.state === "needs_marking"),
    );
    return {
      handedIn,
      // An offer made before the last hand-in can be made again with it.
      mine: own
        ? {
            state: own.state,
            latest:
              JSON.stringify(own.response) === JSON.stringify(sent?.response),
          }
        : null,
      students: people,
      projects: parsed.map(({ studentId, project }) => ({
        studentId,
        files: project.type === "project" ? project.files : [],
        /** A coding project's file and the picture of its stage, where it is one. */
        studio:
          project.type === "scratch"
            ? {
                projectFileId: project.project.fileId,
                thumbnailFileId: project.thumbnail?.fileId ?? null,
              }
            : null,
        remixOf: project.remixOf ?? null,
      })),
    };
  });

/**
 * A student offers the project they last handed in to the class gallery.
 * Classmates see it once their teacher shows it; offering again after a
 * change waits for the teacher again.
 */
export const offerShare = writeProcedure
  .input(galleryRefSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    galleryBlock(played, input.blockId);
    const sent = played.rows.findLast(
      (row) =>
        row.blockId === input.blockId &&
        (row.state === "answered" || row.state === "needs_marking"),
    );
    if (!sent)
      throw new ORPCError("CONFLICT", { message: "learning.share_unsent" });
    await offerProject(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      blockId: input.blockId,
      studentId: played.studentId,
      response: sent.response,
    });
    return { state: "offered" as const };
  });

/** A student takes their project back out of the class gallery. */
export const withdrawShare = writeProcedure
  .input(galleryRefSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    galleryBlock(played, input.blockId);
    await withdrawProject(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      blockId: input.blockId,
      studentId: played.studentId,
    });
    return { state: null };
  });

/**
 * A student begins their project again from a classmate's in the gallery.
 * Their own kept project is replaced, what they handed in stays with their
 * teacher, and the next hand-in says whose project it began from.
 */
export const remixShare = writeProcedure
  .input(galleryItemSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const block = galleryBlock(played, input.blockId);
    // A coding project is begun again in its studio, from the file itself.
    if (block.type !== "project") throw new ORPCError("NOT_FOUND");
    const state = played.checks[block.id];
    if (state?.marked)
      throw new ORPCError("CONFLICT", { message: "learning.settled" });
    if ((state?.tries ?? 0) === 0 || input.studentId === played.studentId)
      throw new ORPCError("NOT_FOUND");
    const classmates = await classmatesOf(context, played);
    const [share] = classmates.includes(input.studentId)
      ? await sharesOf(context.tx, {
          tenantId: context.tenantId,
          lessonIds: [played.row.id],
          studentIds: [input.studentId],
          blockId: block.id,
        })
      : [];
    const response = share ? v.safeParse(responseSchema, share.response) : null;
    if (
      share?.state !== "shown" ||
      !response?.success ||
      response.output.type !== "project"
    )
      throw new ORPCError("NOT_FOUND");
    await keepOwnProject(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      blockId: block.id,
      files: response.output.files,
      basedOn: digest(JSON.stringify(block.files)),
      remixedFrom: input.studentId,
    });
    return { files: response.output.files };
  });

/** Whether a class's lessons tick and chime, for a teacher of the class. */
export const classSounds = readProcedure
  .input(classSoundsSchema)
  .handler(async ({ input, context }) => {
    await soundKeeper(context, input.classId);
    return {
      on:
        (await lessonSoundsOf(context.tx, context.tenantId, input.classId)) ??
        true,
    };
  });

/** Turns a class's lesson sound effects on or off; words still play. */
export const setClassSounds = writeProcedure
  .input(setClassSoundsSchema)
  .handler(async ({ input, context }) => {
    await soundKeeper(context, input.classId);
    await setLessonSounds(context.tx, {
      tenantId: context.tenantId,
      classId: input.classId,
      on: input.on,
    });
    await audit(context, {
      action: "class.lesson_sounds",
      objectType: "class",
      objectId: input.classId,
      details: { on: input.on },
    });
    return { on: input.on };
  });

/**
 * A student answers a question. An auto-marked one is marked at once and
 * says whether it was right, with the feedback of what they chose; its
 * answer and explanation appear only once they get it right, run out of
 * tries or ask for it. A written answer waits for the teacher when it
 * carries points, and can be rewritten until it is marked.
 */
export const respond = writeProcedure
  .input(respondSchema)
  .handler(({ input, context }) => {
    // A code exercise is marked by running it, which respondProgram does
    // outside the transaction; here its results would be the student's word.
    if (input.response.type === "program")
      throw new ORPCError("BAD_REQUEST", { message: "learning.response" });
    return recordResponse(context, input);
  });

/**
 * Keeps what a marked lesson answer shows of the standards its question
 * carries: the first answer to each question in an attempt, or a teacher's
 * mark, which a later mark replaces.
 */
async function keepEvidence(
  context: UnitContext,
  input: {
    lessonId: string;
    studentId: string;
    attempt: number;
    block: CheckBlock;
    fraction: number | null;
    replace: boolean;
  },
) {
  const { standards } = input.block;
  if (!standards?.length || input.fraction === null) return;
  await recordEvidence(context.tx, {
    tenantId: context.tenantId,
    studentId: input.studentId,
    sitting: { source: "lesson", lessonId: input.lessonId },
    marks: [
      {
        attempt: input.attempt,
        blockId: input.block.id,
        standards,
        fraction: input.fraction,
      },
    ],
    replace: input.replace,
  });
}

async function recordResponse(
  context: UnitContext,
  input: { lessonId: string; blockId: string; response: LessonResponse },
) {
  const played = await playable(context, input.lessonId);
  const block = checkBlocks(played.content).find(
    (item) => item.id === input.blockId,
  );
  if (!block) throw new ORPCError("NOT_FOUND");
  pacedAllows(played, block.id);
  const issue = responseIssue(block, input.response);
  if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
  const answered = await withFeatures(
    context,
    block,
    await credited(context, played, block, input.response),
  );
  const response =
    answered.type === "project" && block.type === "project"
      ? { ...answered, files: heldAs(block.files, answered.files) }
      : answered;
  const state = played.checks[block.id];
  // An answer whose feedback waits may change until that feedback comes.
  const held = feedbackAtOf(block) !== "now";
  if (
    isTeacherMarked(block)
      ? state?.marked
      : settled(block, state) && (!held || feedbackOpen(block, played.shown))
  )
    throw new ORPCError("CONFLICT", { message: "learning.settled" });
  const marked = isAuto(block) ? markResponse(block, response) : null;
  const kept = responseFiles(response);
  if (kept.length > 0) {
    // A recording, picture or project must be the student's own upload,
    // kept with the lesson.
    const linked = await linkFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      ids: kept,
      purpose: "document_media",
      host: { type: "lesson_answer", id: played.row.id },
    });
    if (linked.length !== kept.length)
      throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
  }
  await insertResponse(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    documentVersionId: played.versionId,
    studentId: played.studentId,
    blockId: block.id,
    attempt: played.attempt,
    try: held
      ? played.rows.filter((row) => row.blockId === block.id).length + 1
      : (state?.tries ?? 0) + 1,
    kind: block.type,
    response,
    fraction: marked ? marked.fraction : null,
    state: marked
      ? "answered"
      : block.points > 0
        ? "needs_marking"
        : "answered",
  });
  await keepEvidence(context, {
    lessonId: played.row.id,
    studentId: played.studentId,
    attempt: played.attempt,
    block,
    fraction: marked ? marked.fraction : null,
    // A changed answer whose feedback waited replaces the one before.
    replace: held,
  });
  const result = await settle(context, played);
  const after = { ...played, rows: result.rows, checks: result.checks };
  return {
    check: viewOf(block, after),
    score: toldScore(played, result.best),
    completed: result.completed,
    review: reviewOf(after),
  };
}

/** A student asks to see a question's answer; it counts for nothing after that. */
export const reveal = writeProcedure
  .input(revealSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const block = checkBlocks(played.content).find(
      (item) => item.id === input.blockId,
    );
    // An answer whose feedback waits has none to show yet.
    if (!block || !isAuto(block) || !feedbackOpen(block, played.shown))
      throw new ORPCError("NOT_FOUND");
    pacedAllows(played, block.id);
    const state = played.checks[block.id];
    if (!settled(block, state))
      await insertResponse(context.tx, {
        tenantId: context.tenantId,
        lessonId: played.row.id,
        documentVersionId: played.versionId,
        studentId: played.studentId,
        blockId: block.id,
        attempt: played.attempt,
        try: Math.max(1, state?.tries ?? 0),
        kind: block.type,
        response: {},
        fraction: 0,
        state: "revealed",
      });
    await keepEvidence(context, {
      lessonId: played.row.id,
      studentId: played.studentId,
      attempt: played.attempt,
      block,
      fraction: 0,
      replace: false,
    });
    const result = await settle(context, played);
    const after = { ...played, rows: result.rows, checks: result.checks };
    return {
      check: viewOf(block, after),
      score: toldScore(played, result.best),
      completed: result.completed,
      review: reviewOf(after),
    };
  });

/**
 * A student asks for a question's next hint, before an answer or between
 * tries. It costs what a wrong try would.
 */
export const hint = writeProcedure
  .input(revealSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const block = checkBlocks(played.content).find(
      (item) => item.id === input.blockId,
    );
    if (!block) throw new ORPCError("NOT_FOUND");
    pacedAllows(played, block.id);
    const state = played.checks[block.id];
    if (viewOf(block, played).askable === 0)
      throw new ORPCError("CONFLICT", { message: "learning.no_hint" });
    await insertResponse(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      documentVersionId: played.versionId,
      studentId: played.studentId,
      blockId: block.id,
      attempt: played.attempt,
      try: Math.max(1, state?.tries ?? 0),
      kind: block.type,
      response: {},
      fraction: null,
      state: "hint",
    });
    const result = await settle(context, played);
    const after = { ...played, rows: result.rows, checks: result.checks };
    return {
      check: viewOf(block, after),
      score: toldScore(played, result.best),
      completed: result.completed,
      review: reviewOf(after),
    };
  });

/**
 * How a student's class answered a poll, once the student has: how many
 * chose each option the first time they answered, never who did.
 */
export const pollResults = readProcedure
  .input(revealSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const block = played.content.blocks.find(
      (item) => item.id === input.blockId,
    );
    if (block?.type !== "poll" || !block.classResults)
      throw new ORPCError("NOT_FOUND");
    if (!played.checks[block.id]?.tries)
      throw new ORPCError("CONFLICT", { message: "learning.poll_first" });
    const [joined, taught] = await Promise.all([
      classesOfStudent(context, played.studentId),
      classesOfModule(context.tx, context.tenantId, played.owner.id),
    ]);
    const rosters = await Promise.all(
      taught
        .filter((item) => joined.includes(item.id))
        .map((item) => audienceOf(context, played.owner.id, item.id)),
    );
    const votes = await pollVotes(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      blockId: block.id,
      studentIds: [...new Set([played.studentId, ...rosters.flat()])],
    });
    const counts = Object.fromEntries(
      block.options.map((option) => [
        option.id,
        votes.filter((chosen) => chosen.includes(option.id)).length,
      ]),
    );
    return { answered: votes.length, counts };
  });

/**
 * A student asks how they did on the questions that wait for the end of a
 * lesson, once they have answered every one; their answers stand from then.
 */
export const results = writeProcedure
  .input(v.object({ lessonId: id }))
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const waiting = heldChecks(played.content, played.shown).filter(
      (block) => feedbackAtOf(block) === "end",
    );
    if (waiting.length === 0)
      throw new ORPCError("CONFLICT", { message: "learning.no_results" });
    if (waiting.some((block) => !settled(block, played.checks[block.id])))
      throw new ORPCError("CONFLICT", {
        message: "learning.results_unanswered",
      });
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      results: true,
    });
    return { shown: true };
  });

/**
 * A teacher shows a class how it did on a lesson's questions that wait for
 * them, students who answer later seeing it at once; or shows one student
 * ahead of the class, who finished early or needs to go over theirs.
 */
export const release = writeProcedure
  .input(releaseSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.lessonId);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    const classes = await classesOfModule(
      context.tx,
      context.tenantId,
      owner.id,
    );
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    if (
      input.studentId &&
      !(await audienceOf(context, owner.id, input.classId)).includes(
        input.studentId,
      )
    )
      throw new ORPCError("NOT_FOUND");
    await releaseLesson(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      classId: input.classId,
      studentId: input.studentId,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "lesson.release",
      objectType: "lesson",
      objectId: row.id,
      details: {
        classId: input.classId,
        ...(input.studentId ? { studentId: input.studentId } : {}),
      },
    });
    return { released: true };
  });

/**
 * A student answers a question asked again at the end. It is marked at once
 * with its answer shown, once only, and leaves the score as it was: the
 * score says how the lesson went, the second go what stuck.
 */
export const reviewAnswer = writeProcedure
  .input(respondSchema)
  .handler(({ input, context }) => {
    if (input.response.type === "program")
      throw new ORPCError("BAD_REQUEST", { message: "learning.response" });
    return recordReview(context, input);
  });

async function recordReview(
  context: UnitContext,
  input: { lessonId: string; blockId: string; response: LessonResponse },
) {
  const played = await playable(context, input.lessonId);
  const block = played.row.review
    ? reviewBlocks(played.content, played.checks).find(
        (item) => item.id === input.blockId,
      )
    : undefined;
  if (!block) throw new ORPCError("NOT_FOUND");
  const issue = responseIssue(block, input.response);
  if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
  if (played.checks[block.id]?.review !== null)
    throw new ORPCError("CONFLICT", { message: "learning.settled" });
  const { response } = input;
  const marked = markResponse(block, response);
  await insertResponse(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    documentVersionId: played.versionId,
    studentId: played.studentId,
    blockId: block.id,
    attempt: played.attempt,
    try: (played.checks[block.id]?.tries ?? 0) + 1,
    kind: block.type,
    response,
    fraction: marked.fraction,
    state: "reviewed",
  });
  const rows = await responsesOf(context.tx, {
    tenantId: context.tenantId,
    lessonId: played.row.id,
    studentId: played.studentId,
    attempt: played.attempt,
  });
  return { check: describeReview(block, rows) };
}

/**
 * A code exercise's answer, marked by running it. Its tests run between two
 * short units of work, never inside one, so a class checking at once never
 * holds the school's connections while Python runs.
 */
async function programAnswer<T>(
  context: SchoolContext,
  input: { lessonId: string; blockId: string; code: string },
  review: boolean,
  keep: (
    inside: UnitContext,
    answer: { lessonId: string; blockId: string; response: LessonResponse },
  ) => Promise<T>,
): Promise<T> {
  const block = await openUnit(context, "read", async (unit) => {
    const inside = { ...context, ...unit };
    await switchedOn(inside);
    const played = await playable(inside, input.lessonId);
    const found = (
      review
        ? reviewBlocks(played.content, played.checks)
        : checkBlocks(played.content)
    ).find((item) => item.id === input.blockId);
    if (found?.type !== "program") throw new ORPCError("NOT_FOUND");
    const state = played.checks[found.id];
    if (review ? state?.review !== null : settled(found, state))
      throw new ORPCError("CONFLICT", { message: "learning.settled" });
    return found;
  });
  const response = await markedProgram(context.runners, block, {
    type: "program",
    code: input.code,
  });
  return openUnit(context, "write", async (unit) => {
    const inside = { ...context, ...unit };
    await switchedOn(inside);
    return keep(inside, {
      lessonId: input.lessonId,
      blockId: input.blockId,
      response,
    });
  });
}

/** A student checks a code exercise. */
export const respondProgram = schoolProcedure
  .input(respondProgramSchema)
  .handler(({ input, context }) =>
    programAnswer(context, input, false, recordResponse),
  );

/** A student answers a code exercise asked again at the end. */
export const reviewProgram = schoolProcedure
  .input(respondProgramSchema)
  .handler(({ input, context }) =>
    programAnswer(context, input, true, recordReview),
  );

/**
 * A student ran a code exercise in the browser. The run is kept for their
 * teacher to replay and marks nothing; checking an answer runs it here.
 */
export const run = writeProcedure
  .input(runSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const block = checkBlocks(played.content).find(
      (item) => item.id === input.blockId,
    );
    if (block?.type !== "program") throw new ORPCError("NOT_FOUND");
    const kept = await recordRun(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      blockId: block.id,
      attempt: played.attempt,
      code: input.code,
      input: input.input,
      outcome: input.outcome,
      error: input.error,
      output: input.output,
    });
    return { kept };
  });

/**
 * Starts the lesson again with fresh questions once every one is settled, so
 * an attempt is never left before showing an answer could lower its score.
 * The best score so far stays.
 */
export const retry = writeProcedure
  .input(v.object({ lessonId: id }))
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    const auto = checkBlocks(played.content).filter(isAuto);
    if (auto.length === 0)
      throw new ORPCError("CONFLICT", { message: "learning.nothing_to_retry" });
    // Short of a gate's score, a student has nothing left to try but another go.
    if (
      !auto.every((block) => settled(block, played.checks[block.id])) &&
      !shortOfGate(played.content, played.checks)
    )
      throw new ORPCError("CONFLICT", { message: "learning.not_done" });
    // Another go starts from knowing how this one went.
    if (heldChecks(played.content, played.shown).length > 0)
      throw new ORPCError("CONFLICT", { message: "learning.results_waiting" });
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      nextAttempt: true,
    });
    return { attempt: played.attempt + 1 };
  });

/** A student says they are done; lessons with a stricter rule need that rule met. */
export const complete = writeProcedure
  .input(v.object({ lessonId: id }))
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    if (
      played.row.completion !== "mark" &&
      !completionMet(
        played.row,
        played.content,
        played.checks,
        await watchedFor(context, played),
      )
    )
      throw new ORPCError("CONFLICT", { message: "learning.not_done" });
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      completed: { by: "student" },
    });
    return { completed: true };
  });

/** Where the student stopped reading, so the lesson opens there next time. */
export const position = writeProcedure
  .input(positionSchema)
  .handler(async ({ input, context }) => {
    const { row, studentId } = await playable(context, input.lessonId);
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      studentId,
      position: input.blockId,
    });
    return { saved: true };
  });

/**
 * Stretches a student played of one of a lesson's recordings, and where they
 * are in it. A lesson that finishes on watching finishes here.
 */
export const watch = writeProcedure
  .input(watchSchema)
  .handler(async ({ input, context }) => {
    const played = await playable(context, input.lessonId);
    if (!lessonWatchables(played.content).includes(input.video))
      throw new ORPCError("NOT_FOUND");
    const watched = await recordWatch(context.tx, {
      tenantId: context.tenantId,
      lessonId: played.row.id,
      studentId: played.studentId,
      video: input.video,
      ranges: input.ranges,
      durationSeconds: input.durationSeconds,
      positionSeconds: input.positionSeconds,
    });
    if (played.row.completion !== "watch" || played.own?.completedAt)
      return { completed: Boolean(played.own?.completedAt), watched };
    const met = completionMet(
      played.row,
      played.content,
      played.checks,
      await watchedIn(context, played),
    );
    if (met)
      await recordProgress(context.tx, {
        tenantId: context.tenantId,
        lessonId: played.row.id,
        studentId: played.studentId,
        completed: { by: "student" },
      });
    return { completed: met, watched };
  });

/** The project an offer to a gallery holds, unless it is the answer it lies beside. */
function offeredApart(
  held: Record<string, unknown>,
  answer: {
    files: { name: string; code: string }[] | null;
    project: { fileId: string } | null;
  },
) {
  const parsed = v.safeParse(responseSchema, held);
  if (!parsed.success) return null;
  const offer = parsed.output;
  if (offer.type === "project")
    return sameFiles(offer.files, answer.files ?? [])
      ? null
      : { files: offer.files, project: null, thumbnail: null };
  if (offer.type === "scratch")
    return offer.project.fileId === answer.project?.fileId
      ? null
      : {
          files: null,
          project: offer.project,
          thumbnail: offer.thumbnail ?? null,
        };
  return null;
}

/** The answers a teacher marks, words or coding projects, of a class in a module. */
export const answers = readProcedure
  .input(progressQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      audienceOf(context, row.id, input.classId),
    ]);
    const questions: {
      lessonId: string;
      lessonTitle: string;
      blockId: string;
      kind: "written" | "scratch" | "project";
      prompt: string;
      points: number;
      /** Students may offer their answer to the class gallery. */
      gallery: boolean;
      checks: ScratchFeature[];
      standards: string[];
      passage: string | null;
    }[] = [];
    for (const item of lessons) {
      const published = await publishedLesson(context, item.id);
      for (const block of checkBlocks(
        published?.content ?? { version: 2, blocks: [] },
      ))
        if (isTeacherMarked(block))
          questions.push({
            lessonId: item.id,
            lessonTitle: item.title,
            blockId: block.id,
            kind: block.type,
            prompt: block.prompt,
            points: block.points,
            gallery:
              (block.type === "project" || block.type === "scratch") &&
              block.gallery,
            /** What a coding question asks every project to have. */
            checks: block.type === "scratch" ? block.checks : [],
            standards: block.standards ?? [],
            /** The passage a reading aloud reads, marked word by word. */
            passage: block.type === "written" ? (block.passage ?? null) : null,
          });
    }
    const scope = {
      tenantId: context.tenantId,
      lessonIds: lessons.map((item) => item.id),
      studentIds: roster,
    };
    const [students, written, shares] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      answersToMark(context.tx, scope),
      sharesOf(context.tx, scope),
    ]);
    const asked = new Set(questions.map((question) => question.blockId));
    // A young class's teacher judges its children against the goals its
    // questions are tagged with, from what they answered.
    const tagged = [
      ...new Set(questions.flatMap((question) => question.standards)),
    ];
    const judging =
      tagged.length > 0 &&
      classes.some((item) => item.id === input.classId && item.young) &&
      can(context, "submissions:grade") &&
      (await teachesClass(context.tx, scopeOf(context), input.classId));
    const goals = judging
      ? {
          standards: await standardsByIds(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            ids: tagged,
          }),
          judgements: (
            await judgementsOf(context.tx, {
              tenantId: context.tenantId,
              orgId: context.schoolId,
              studentIds: roster,
              standardIds: tagged,
            })
          ).map((judgement) => ({
            studentId: judgement.studentId,
            standardId: judgement.standardId,
            level: judgement.level,
          })),
        }
      : null;
    const offered = new Map(
      shares.map((share) => [
        `${share.lessonId}:${share.blockId}:${share.studentId}`,
        share,
      ]),
    );
    return {
      students,
      questions,
      goals,
      answers: written
        .filter((answer) => asked.has(answer.blockId))
        .map((answer) => {
          const share = offered.get(
            `${answer.lessonId}:${answer.blockId}:${answer.studentId}`,
          );
          return {
            ...answer,
            /** How the student's offer to the class gallery stands, if they made one. */
            share: share?.state ?? null,
            /**
             * The project the gallery holds where it is not this answer: a
             * student offers one as they then had it, and may have sent
             * another since. It is what the class sees, so the teacher must.
             */
            offered: share ? offeredApart(share.response, answer) : null,
          };
        }),
    };
  });

/**
 * A teacher shows a project a student offered to the class gallery, or
 * keeps it out; taking one down later is the same decision made again.
 */
export const decideShare = writeProcedure
  .input(decideShareSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.lessonId);
    if (!row) throw new ORPCError("NOT_FOUND");
    await editableModule(context, row.moduleId);
    const state = input.show ? "shown" : "declined";
    const decided = await decideOffered(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      blockId: input.blockId,
      studentId: input.studentId,
      state,
      userId: context.actor.userId,
    });
    if (!decided) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "lesson.share_decided",
      objectType: "lesson",
      objectId: row.id,
      details: {
        blockId: input.blockId,
        studentId: input.studentId,
        state,
      },
    });
    return { state };
  });

/**
 * Whether some of a lesson's questions wait for the teacher, and if so who
 * of the class has been shown how they did: all of it, or students shown
 * on their own.
 */
function releaseOf(
  content: LessonDocument,
  releases: readonly { studentId: string | null }[],
) {
  if (!autoBlocks(content).some((block) => feedbackAtOf(block) === "teacher"))
    return null;
  return {
    released: releases.some((row) => row.studentId === null),
    students: releases.flatMap((row) => row.studentId ?? []),
  };
}

/**
 * Who chose what, by student; for a poll counted without names, only how
 * many chose each option and how many answered.
 */
function namedChoices(
  block: CheckBlock,
  choices: Record<string, string[]>,
): {
  firstChoices: Record<string, string[]>;
  tally: { answered: number; counts: Record<string, number> } | null;
} {
  if (block.type !== "poll" || !block.anonymous)
    return { firstChoices: choices, tally: null };
  const votes = Object.values(choices);
  return {
    firstChoices: {},
    tally: {
      answered: votes.length,
      counts: Object.fromEntries(
        block.options.map((option) => [
          option.id,
          votes.filter((chosen) => chosen.includes(option.id)).length,
        ]),
      ),
    },
  };
}

/**
 * How a class did on a lesson's marked questions, from the rows given of
 * one attempt each: where every student stands, and for a choice, who
 * first chose which option.
 */
function questionsOf(
  content: LessonDocument,
  rows: Awaited<ReturnType<typeof firstAttempts>>,
  roster: readonly string[],
  ran: Awaited<ReturnType<typeof runCounts>>,
) {
  const states = new Map(
    roster.map((studentId) => [
      studentId,
      checkStates(
        content,
        rows.filter((response) => response.studentId === studentId),
      ),
    ]),
  );
  return checkBlocks(content)
    .filter(isAuto)
    .map((block) => ({
      id: block.id,
      kind: block.type,
      prompt: block.prompt,
      /** Answered in one go, its feedback waiting, so the last answer counts. */
      once: feedbackAtOf(block) !== "now",
      options:
        block.type === "choice" || block.type === "poll"
          ? block.options.map((option) => ({
              id: option.id,
              text: option.text,
              correct:
                block.type === "choice" &&
                block.correctOptionIds.includes(option.id),
            }))
          : null,
      standings: Object.fromEntries(
        roster.map((studentId) => [
          studentId,
          standingOf(states.get(studentId)?.[block.id]),
        ]),
      ),
      ...namedChoices(
        block,
        Object.fromEntries(
          roster.flatMap((studentId) => {
            const answered = rows.filter(
              (response) =>
                response.studentId === studentId &&
                response.blockId === block.id &&
                response.state === "answered",
            );
            // An answer whose feedback waited counts as last given.
            const first = (
              feedbackAtOf(block) === "now"
                ? answered.find((response) => response.try === 1)
                : answered.at(-1)
            )?.response;
            const chosen = first?.optionIds;
            return Array.isArray(chosen) ? [[studentId, chosen]] : [];
          }),
        ) as Record<string, string[]>,
      ),
      runs: Object.fromEntries(
        ran
          .filter((count) => count.blockId === block.id)
          .map((count) => [count.studentId, count.runs]),
      ),
    }));
}

/**
 * How a class did on each marked question, from each student's first
 * attempt. Only those who teach the module see it.
 */
export const questions = readProcedure
  .input(progressQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      audienceOf(context, row.id, input.classId),
    ]);
    const [students, rows, ran, released] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      firstAttempts(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        studentIds: roster,
      }),
      runCounts(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        studentIds: roster,
      }),
      releasesOf(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        classId: input.classId,
      }),
    ]);
    const asked = [];
    for (const item of lessons) {
      const content =
        (await publishedLesson(context, item.id))?.content ?? null;
      if (!content) continue;
      const marked = questionsOf(
        content,
        rows.filter((response) => response.lessonId === item.id),
        roster,
        ran,
      );
      if (marked.length === 0) continue;
      asked.push({
        id: item.id,
        title: item.title,
        young: item.young,
        questions: marked,
        release: releaseOf(
          content,
          released.filter((entry) => entry.lessonId === item.id),
        ),
      });
    }
    return { students, lessons: asked };
  });

/** An answer checked, or the answer shown, among a student's runs. */
type CheckMark =
  | { kind: "shown"; attempt: number; at: string }
  | {
      kind: "checked";
      attempt: number;
      at: string;
      code: string;
      passed: number;
      total: number;
    };

/**
 * How one student came to their program for a code exercise: each run in the
 * browser and each answer checked, every attempt, oldest first. Only those
 * who teach the module see it.
 */
export const runs = readProcedure
  .input(runsQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await editableModule(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      audienceOf(context, row.id, input.classId),
    ]);
    if (
      !lessons.some((item) => item.id === input.lessonId) ||
      !roster.includes(input.studentId)
    )
      throw new ORPCError("NOT_FOUND");
    const content = (await publishedLesson(context, input.lessonId))?.content;
    const block = content
      ? checkBlocks(content).find((item) => item.id === input.blockId)
      : undefined;
    if (block?.type !== "program") throw new ORPCError("NOT_FOUND");
    const where = {
      tenantId: context.tenantId,
      lessonId: input.lessonId,
      studentId: input.studentId,
      blockId: block.id,
    };
    const [ran, tries] = await Promise.all([
      runsOf(context.tx, where),
      responsesTo(context.tx, where),
    ]);
    return {
      language: block.language,
      starter: block.starter,
      runs: ran,
      checks: tries.flatMap((item): CheckMark[] => {
        if (item.state === "revealed")
          return [
            {
              kind: "shown" as const,
              attempt: item.attempt,
              at: item.createdAt,
            },
          ];
        if (item.state !== "answered" && item.state !== "reviewed") return [];
        const answer = item.response as {
          code?: unknown;
          results?: Record<string, { passed?: unknown }>;
        };
        return [
          {
            kind: "checked",
            attempt: item.attempt,
            at: item.createdAt,
            code: typeof answer.code === "string" ? answer.code : "",
            passed: Object.values(answer.results ?? {}).filter(
              (result) => result.passed === true,
            ).length,
            total: block.tests.length,
          },
        ];
      }),
    };
  });

/**
 * A teacher marks a written answer out of its points, with feedback the
 * student reads; an answer worth no points takes feedback alone.
 */
export const mark = writeProcedure
  .input(markSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.lessonId);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editableModule(context, row.moduleId);
    const studentIds = [...new Set(input.studentIds)];
    const classes = await classesOfModule(
      context.tx,
      context.tenantId,
      owner.id,
    );
    const enrolled = new Set<string>();
    for (const item of classes)
      for (const studentId of await audienceOf(context, owner.id, item.id))
        enrolled.add(studentId);
    if (!studentIds.every((studentId) => enrolled.has(studentId)))
      throw new ORPCError("NOT_FOUND");
    const published = await publishedLesson(context, row.id);
    const block = checkBlocks(
      published?.content ?? { version: 2, blocks: [] },
    ).find((item) => item.id === input.blockId);
    if (!block || !isTeacherMarked(block)) throw new ORPCError("NOT_FOUND");
    if (input.points > block.points)
      throw new ORPCError("BAD_REQUEST", { message: "learning.points_over" });
    // A reading is marked for the one student who read it, word by word
    // within the passage.
    const passage = block.type === "written" ? (block.passage ?? "") : "";
    if (
      input.fluency &&
      (!passage ||
        studentIds.length !== 1 ||
        [...input.fluency.errors, input.fluency.lastWord ?? 0].some(
          (place) => place >= readingWords(passage).length,
        ))
    )
      throw new ORPCError("BAD_REQUEST", { message: "learning.fluency" });
    const written = (
      await answersToMark(context.tx, {
        tenantId: context.tenantId,
        lessonIds: [row.id],
        studentIds,
      })
    ).filter((item) => item.blockId === block.id);
    for (const studentId of studentIds) {
      const answer = written.find((item) => item.studentId === studentId);
      if (!answer) throw new ORPCError("NOT_FOUND");
      await insertResponse(context.tx, {
        tenantId: context.tenantId,
        lessonId: row.id,
        documentVersionId: published?.versionId ?? null,
        studentId,
        blockId: block.id,
        attempt: answer.attempt,
        try: answer.try,
        kind: "written",
        response: input.fluency ? { fluency: input.fluency } : {},
        fraction:
          block.points === 0
            ? null
            : Math.round((input.points / block.points) * 10000) / 10000,
        state: "marked",
        feedback: input.feedback || null,
        markedBy: context.actor.userId,
      });
      await keepEvidence(context, {
        lessonId: row.id,
        studentId,
        attempt: answer.attempt,
        block,
        fraction:
          block.points === 0
            ? null
            : Math.round((input.points / block.points) * 10000) / 10000,
        replace: true,
      });
      await audit(context, {
        action: "lesson.mark",
        objectType: "lesson",
        objectId: row.id,
        subjectUserId: studentId,
        studentUserId: studentId,
        details: { blockId: block.id, points: input.points },
      });
    }
    return { marked: studentIds.length };
  });
