import type { LessonRow, ModuleRow } from "@faridalms/database/stores/learning";
import type { LessonAnswers, LessonDocument } from "@faridalms/domain/learning";

import { reachOf } from "@faridalms/database/stores/audiences";
import {
  classesTaughtBy,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/coursework";
import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import { schoolFeatures } from "@faridalms/database/stores/identity";
import {
  classesOfModule,
  insertLesson,
  insertModule,
  lessonById,
  lessonsOf,
  moduleById,
  moduleFinished,
  modulesForClasses,
  orderLessons,
  progressIn,
  recordProgress,
  removeLesson as tombstoneLesson,
  setModuleClasses,
  setModuleState,
  studentModules,
  updateLesson,
  updateModule,
} from "@faridalms/database/stores/learning";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { gridOwners } from "@faridalms/database/stores/timetable";
import { schoolYears, workingYear } from "@faridalms/database/stores/years";
import {
  answerSchema,
  answersOf,
  completionMet,
  duplicateModuleSchema,
  emptyLesson,
  lessonFileIds,
  lessonPlainText,
  lessonScore,
  moduleRefSchema,
  moveLessonSchema,
  overrideSchema,
  positionSchema,
  progressQuerySchema,
  publishModuleSchema,
  quizBlocks,
  quizIsCorrect,
  reflectSchema,
  saveLessonSchema,
  saveModuleSchema,
  studentBlocks,
} from "@faridalms/domain/learning";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure as anyRead,
  requireCapability,
  writeProcedure as anyWrite,
} from "../core/procedure";
import { registerHostReader, registerHostWriter } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

async function isOn(context: UnitContext) {
  const features = await schoolFeatures(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return features.elearning;
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

async function ofSchool(context: UnitContext, moduleId: string) {
  const row = await moduleById(context.tx, context.tenantId, moduleId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

/** Whether the viewer may change a module: its author, or a teacher of one of its classes. */
async function mayEdit(context: UnitContext, row: ModuleRow) {
  if (!can(context, "learning:author")) return false;
  if (row.authorUserId === context.actor.userId) return true;
  if (can(context, "classes:manage")) return true;
  const classes = await classesOfModule(context.tx, context.tenantId, row.id);
  for (const item of classes)
    if (await teachesClass(context.tx, scopeOf(context), item.id)) return true;
  return false;
}

async function editable(context: UnitContext, moduleId: string) {
  const row = await ofSchool(context, moduleId);
  if (!(await mayEdit(context, row))) throw new ORPCError("NOT_FOUND");
  return row;
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

/** A module open to the student, or not found; with whether its prerequisite still locks it. */
async function openModule(
  context: UnitContext,
  moduleId: string,
  studentId: string,
) {
  const row = await ofSchool(context, moduleId);
  if (!isOpen(row, context.now)) throw new ORPCError("NOT_FOUND");
  const classes = await classesOfModule(context.tx, context.tenantId, row.id);
  const mine = new Set(await classesOfStudent(context, studentId));
  if (!classes.some((item) => mine.has(item.id)))
    throw new ORPCError("NOT_FOUND");
  const locked =
    row.prerequisiteId !== null &&
    !(await moduleFinished(context.tx, {
      tenantId: context.tenantId,
      moduleId: row.prerequisiteId,
      studentId,
    }));
  return { row, locked };
}

async function lessonDocument(
  context: UnitContext,
  lessonId: string,
): Promise<LessonDocument> {
  const document = await documentOf(context.tx, context.tenantId, {
    type: "lesson",
    id: lessonId,
  });
  return (
    (document?.content as unknown as LessonDocument | undefined) ??
    emptyLesson()
  );
}

/** Each lesson's state for a student: done, open, or locked behind an earlier one. */
function outline(
  row: ModuleRow,
  lessons: Awaited<ReturnType<typeof lessonsOf>>,
  done: ReadonlySet<string>,
  locked: boolean,
) {
  let blocked = locked;
  return lessons.map((lesson) => {
    const state = done.has(lesson.id)
      ? ("done" as const)
      : blocked
        ? ("locked" as const)
        : ("open" as const);
    if (row.sequential && !done.has(lesson.id)) blocked = true;
    return { ...lesson, state };
  });
}

async function hostReadable(context: UnitContext, lessonId: string) {
  if (!(await isOn(context))) return false;
  const lesson = await lessonById(context.tx, context.tenantId, lessonId);
  if (!lesson) return false;
  const row = await moduleById(context.tx, context.tenantId, lesson.moduleId);
  if (!row || row.orgId !== context.schoolId) return false;
  if (await mayEdit(context, row)) return true;
  try {
    await openModule(context, row.id, context.actor.userId);
    return true;
  } catch {
    return false;
  }
}

registerHostReader("lesson", hostReadable);
registerHostWriter("lesson", async (context, lessonId) => {
  if (!(await isOn(context))) return false;
  const lesson = await lessonById(context.tx, context.tenantId, lessonId);
  if (!lesson) return false;
  const row = await moduleById(context.tx, context.tenantId, lesson.moduleId);
  return Boolean(
    row && row.orgId === context.schoolId && (await mayEdit(context, row)),
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
    const row = await editable(context, input.id);
    const [classes, lessons] = await Promise.all([
      classesOfModule(context.tx, context.tenantId, row.id),
      lessonsOf(context.tx, context.tenantId, row.id),
    ]);
    return { ...row, classes, lessons, open: isOpen(row, context.now) };
  });

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
      const before = await ofSchool(context, prerequisiteId);
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
    };
    let moduleId = input.id;
    let version: number;
    if (input.id) {
      await editable(context, input.id);
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
    const row = await editable(context, input.id);
    const lessons = await lessonsOf(context.tx, context.tenantId, row.id);
    if (lessons.length === 0)
      throw new ORPCError("CONFLICT", { message: "learning.lesson_required" });
    for (const lesson of lessons)
      if (
        lessonPlainText(await lessonDocument(context, lesson.id)).trim() === ""
      )
        throw new ORPCError("CONFLICT", { message: "learning.lesson_empty" });
    const version = await setModuleState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "published",
      publishAt: input.publishAt || context.now.toISOString(),
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
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
    const row = await editable(context, input.id);
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
    const row = await editable(context, input.id);
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
export const duplicateModule = writeProcedure
  .input(duplicateModuleSchema)
  .handler(async ({ input, context }) => {
    const row = await editable(context, input.id);
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
    });
    await setModuleClasses(context.tx, {
      tenantId: context.tenantId,
      moduleId: created.id,
      classIds: input.classIds,
    });
    for (const lesson of await lessonsOf(
      context.tx,
      context.tenantId,
      row.id,
    )) {
      const copy = await insertLesson(context.tx, {
        tenantId: context.tenantId,
        moduleId: created.id,
        title: lesson.title,
        completion: lesson.completion,
        passScore: lesson.passScore,
      });
      const content = await lessonDocument(context, lesson.id);
      await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: { type: "lesson", id: copy.id },
        kind: "lesson",
        content,
        plainText: lessonPlainText(content),
        mediaIds: lessonFileIds(content),
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
    const owner = await editable(context, row.moduleId);
    return {
      ...row,
      module: { id: owner.id, title: owner.title },
      content: await lessonDocument(context, row.id),
    };
  });

export const saveLesson = writeProcedure
  .input(saveLessonSchema)
  .handler(async ({ input, context }) => {
    const owner = await editable(context, input.moduleId);
    const fields = {
      title: input.title,
      completion: input.completion,
      passScore: input.passScore,
    };
    let lessonId = input.id;
    let version: number;
    if (input.id) {
      const row = await lessonById(context.tx, context.tenantId, input.id);
      if (!row || row.moduleId !== owner.id) throw new ORPCError("NOT_FOUND");
      const next = await updateLesson(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
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
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: { type: "lesson", id: lessonId },
      kind: "lesson",
      content: input.content,
      plainText: lessonPlainText(input.content),
      mediaIds: lessonFileIds(input.content),
      userId: context.actor.userId,
    });
    await audit(context, {
      action: input.id ? "lesson.update" : "lesson.create",
      objectType: "lesson",
      objectId: lessonId,
      details: { moduleId: owner.id, title: input.title },
    });
    return { id: lessonId, version };
  });

export const moveLesson = writeProcedure
  .input(moveLessonSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editable(context, row.moduleId);
    const order = (await lessonsOf(context.tx, context.tenantId, owner.id))
      .map((item) => item.id)
      .filter((lessonId) => lessonId !== row.id);
    order.splice(Math.min(input.position, order.length), 0, row.id);
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
    const owner = await editable(context, row.moduleId);
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
    const row = await editable(context, input.moduleId);
    const classes = await classesOfModule(context.tx, context.tenantId, row.id);
    if (!classes.some((item) => item.id === input.classId))
      throw new ORPCError("NOT_FOUND");
    const [lessons, roster] = await Promise.all([
      lessonsOf(context.tx, context.tenantId, row.id),
      rosterOf(context.tx, context.tenantId, input.classId, context.today),
    ]);
    const [students, cells] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      progressIn(context.tx, {
        tenantId: context.tenantId,
        lessonIds: lessons.map((item) => item.id),
        studentIds: roster,
      }),
    ]);
    return {
      module: { id: row.id, title: row.title },
      classes,
      lessons,
      students,
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

/** A teacher marks a lesson done for a student, or takes that back. */
export const override = writeProcedure
  .input(overrideSchema)
  .handler(async ({ input, context }) => {
    const row = await lessonById(context.tx, context.tenantId, input.lessonId);
    if (!row) throw new ORPCError("NOT_FOUND");
    const owner = await editable(context, row.moduleId);
    const classes = await classesOfModule(
      context.tx,
      context.tenantId,
      owner.id,
    );
    let enrolled = false;
    for (const item of classes)
      if (
        (
          await rosterOf(context.tx, context.tenantId, item.id, context.today)
        ).includes(input.studentId)
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
    const finished = new Set(
      rows
        .filter((row) => row.lessons > 0 && row.completed === row.lessons)
        .map((row) => row.id),
    );
    return {
      rows: rows.map((row) => ({
        ...row,
        locked:
          row.prerequisiteId !== null && !finished.has(row.prerequisiteId),
      })),
    };
  });

/** A module's lessons as a student meets them: done, open or locked. */
export const play = readProcedure
  .input(
    v.object({ id, studentId: v.optional(v.union([v.literal(""), id]), "") }),
  )
  .handler(async ({ input, context }) => {
    const { studentId, own } = await learner(context, input.studentId);
    const { row, locked } = await openModule(context, input.id, studentId);
    const lessons = await lessonsOf(context.tx, context.tenantId, row.id);
    const cells = await progressIn(context.tx, {
      tenantId: context.tenantId,
      lessonIds: lessons.map((item) => item.id),
      studentIds: [studentId],
    });
    const done = new Set(
      cells.filter((cell) => cell.completedAt).map((cell) => cell.lessonId),
    );
    return {
      ...row,
      locked,
      own,
      lessons: outline(row, lessons, done, locked),
    };
  });

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
  const lessons = await lessonsOf(context.tx, context.tenantId, owner.id);
  const cells = await progressIn(context.tx, {
    tenantId: context.tenantId,
    lessonIds: lessons.map((item) => item.id),
    studentIds: [studentId],
  });
  const done = new Set(
    cells.filter((cell) => cell.completedAt).map((cell) => cell.lessonId),
  );
  const states = outline(owner, lessons, done, locked);
  const state = states.find((item) => item.id === row.id)?.state;
  if (state === "locked")
    throw new ORPCError("CONFLICT", { message: "learning.locked" });
  return {
    row,
    owner,
    states,
    studentId,
    mine: cells.find((cell) => cell.lessonId === row.id) ?? null,
    content: await lessonDocument(context, row.id),
  };
}

/** Finishes the lesson when the student's work now meets its rule. */
async function settle(
  context: UnitContext,
  input: {
    lesson: LessonRow;
    content: LessonDocument;
    answers: LessonAnswers;
    studentId: string;
  },
) {
  const met = completionMet(input.lesson, input.content, input.answers);
  if (met)
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: input.lesson.id,
      studentId: input.studentId,
      completed: { by: "student" },
    });
  return met;
}

/** One lesson for its student: the blocks without answers, and what they have done. */
export const playLesson = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const {
      row,
      owner,
      states,
      studentId,
      mine: progressRow,
      content,
    } = await playable(context, input.id);
    const answers = answersOf(progressRow?.answers);
    if (row.completion === "view")
      await settle(context, { lesson: row, content, answers, studentId });
    else if (!progressRow)
      await recordProgress(context.tx, {
        tenantId: context.tenantId,
        lessonId: row.id,
        studentId,
      });
    const index = states.findIndex((item) => item.id === row.id);
    const quizzes = new Map(
      quizBlocks(content).map((block) => [block.id, block]),
    );
    return {
      ...row,
      module: { id: owner.id, title: owner.title },
      blocks: studentBlocks(content),
      answers: {
        quiz: Object.fromEntries(
          Object.entries(answers.quiz).map(([blockId, answer]) => [
            blockId,
            {
              ...answer,
              correctOptionIds: quizzes.get(blockId)?.correctOptionIds ?? [],
              explanation: quizzes.get(blockId)?.explanation ?? "",
            },
          ]),
        ),
        reflections: answers.reflections,
      },
      completedAt:
        row.completion === "view"
          ? (progressRow?.completedAt ?? context.now.toISOString())
          : (progressRow?.completedAt ?? null),
      score: progressRow?.score ?? null,
      position: progressRow?.position ?? null,
      previous: states[index - 1]?.id ?? null,
      next:
        states[index + 1] && states[index + 1]?.state !== "locked"
          ? (states[index + 1]?.id ?? null)
          : null,
      index,
      total: states.length,
    };
  });

/** A student answers a quiz block; they learn at once whether it was right. */
export const answer = writeProcedure
  .input(answerSchema)
  .handler(async ({ input, context }) => {
    const {
      row,
      studentId,
      mine: progressRow,
      content,
    } = await playable(context, input.lessonId);
    const block = quizBlocks(content).find((item) => item.id === input.blockId);
    if (!block) throw new ORPCError("NOT_FOUND");
    if (
      input.optionIds.some(
        (optionId) => !block.options.some((option) => option.id === optionId),
      )
    )
      throw new ORPCError("BAD_REQUEST", { message: "learning.option" });
    const answers = answersOf(progressRow?.answers);
    const correct = quizIsCorrect(block, input.optionIds);
    answers.quiz[block.id] = {
      optionIds: input.optionIds,
      correct,
      tries: (answers.quiz[block.id]?.tries ?? 0) + 1,
    };
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      studentId,
      answers: answers as unknown as Record<string, unknown>,
      score: lessonScore(content, answers),
      attempt: true,
    });
    const completed = await settle(context, {
      lesson: row,
      content,
      answers,
      studentId,
    });
    return {
      correct,
      correctOptionIds: block.correctOptionIds,
      explanation: block.explanation,
      score: lessonScore(content, answers),
      completed,
    };
  });

export const reflect = writeProcedure
  .input(reflectSchema)
  .handler(async ({ input, context }) => {
    const {
      row,
      studentId,
      mine: progressRow,
      content,
    } = await playable(context, input.lessonId);
    if (
      !content.blocks.some(
        (block) => block.type === "reflection" && block.id === input.blockId,
      )
    )
      throw new ORPCError("NOT_FOUND");
    const answers = answersOf(progressRow?.answers);
    answers.reflections[input.blockId] = { text: input.text };
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      studentId,
      answers: answers as unknown as Record<string, unknown>,
    });
    return {
      completed: await settle(context, {
        lesson: row,
        content,
        answers,
        studentId,
      }),
    };
  });

/** A student says they are done; lessons with a stricter rule need that rule met. */
export const complete = writeProcedure
  .input(v.object({ lessonId: id }))
  .handler(async ({ input, context }) => {
    const {
      row,
      studentId,
      mine: progressRow,
      content,
    } = await playable(context, input.lessonId);
    const answers = answersOf(progressRow?.answers);
    if (row.completion !== "mark" && !completionMet(row, content, answers))
      throw new ORPCError("CONFLICT", { message: "learning.not_done" });
    await recordProgress(context.tx, {
      tenantId: context.tenantId,
      lessonId: row.id,
      studentId,
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
