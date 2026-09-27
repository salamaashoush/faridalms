import * as repo from "@faridalms/database/repositories/learning";
import { ManagementError } from "@faridalms/database/repositories/management";
import { listClasses } from "@faridalms/database/repositories/school";
import {
  answerQuizSchema,
  completeLessonSchema,
  learnerModuleQuerySchema,
  learnerModulesQuerySchema,
  moduleRevisionSchema,
  saveLessonSchema,
  saveModuleSchema,
} from "@faridalms/domain/learning";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { SchoolContext } from "../context";

import {
  assessmentScope,
  requirePermission,
  requireStudentAccess,
  visibleClassIds,
} from "../authorization";
import { protectedProcedure } from "../procedure";

const id = v.object({ id: v.pipe(v.string(), v.uuid()) });

async function managed<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

/** Every learning call answers not found while the school keeps the module off. */
async function requireLearning(context: SchoolContext) {
  const features = await repo.getFeatures(context.db);
  if (!features.elearning)
    throw new ORPCError("NOT_FOUND", { message: "learning.disabled" });
}

function actor(context: SchoolContext) {
  return {
    userId: context.user.id,
    scope: assessmentScope(context, "assignments:author"),
  };
}

async function requireOwnStudent(context: SchoolContext) {
  const user = await requirePermission(context, "own-work:submit");
  if (!user.ownStudentId) throw new ORPCError("FORBIDDEN");
  return user.ownStudentId;
}

// --- features -------------------------------------------------------------------

// --- authoring ------------------------------------------------------------------

export const getTeachingModules = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return repo.listModulesForTeacher(
      context.db,
      await visibleClassIds(context, user),
      actor(context).scope,
    );
  },
);

/** Classes the teacher can set a module in, with the subjects they author there. */
export const getModuleClasses = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "assignments:author");
    await requireLearning(context);
    const classes = await listClasses(
      context.db,
      await visibleClassIds(context, user),
      actor(context).scope,
    );
    return classes.filter((row) => row.authoringSubjects.length > 0);
  },
);

export const getModuleAuthoring = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() =>
      repo.moduleForAuthoring(context.db, input.id, actor(context)),
    );
  });

export const saveModule = protectedProcedure
  .input(saveModuleSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() => repo.saveModule(context.db, input, actor(context)));
  });

export const publishModule = protectedProcedure
  .input(moduleRevisionSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() =>
      repo.publishModule(context.db, input, actor(context), new Date()),
    );
  });

export const unpublishModule = protectedProcedure
  .input(moduleRevisionSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() =>
      repo.unpublishModule(context.db, input, actor(context)),
    );
  });

export const getLessonAuthoring = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() =>
      repo.lessonForAuthoring(context.db, input.id, actor(context)),
    );
  });

export const saveLesson = protectedProcedure
  .input(saveLessonSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() => repo.saveLesson(context.db, input, actor(context)));
  });

export const deleteLesson = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:author");
    await requireLearning(context);
    return managed(() =>
      repo.deleteLesson(context.db, input.id, actor(context)),
    );
  });

// --- learning ---------------------------------------------------------------------

export const getLearnerModules = protectedProcedure
  .input(learnerModulesQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:read");
    await requireLearning(context);
    const { studentId } = await requireStudentAccess(context, input.studentId);
    return {
      studentId,
      rows: await repo.listModulesForStudent(
        context.db,
        studentId,
        context.today,
      ),
    };
  });

export const getLearnerModule = protectedProcedure
  .input(learnerModuleQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:read");
    await requireLearning(context);
    const { studentId } = await requireStudentAccess(context, input.studentId);
    const module = await repo.moduleForStudent(
      context.db,
      input.id,
      studentId,
      context.today,
    );
    if (!module) throw new ORPCError("NOT_FOUND");
    return { studentId, module };
  });

export const getLearnerLesson = protectedProcedure
  .input(learnerModuleQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "assignments:read");
    await requireLearning(context);
    const { studentId } = await requireStudentAccess(context, input.studentId);
    const lesson = await repo.lessonForStudent(
      context.db,
      input.id,
      studentId,
      context.today,
    );
    if (!lesson) throw new ORPCError("NOT_FOUND");
    return {
      studentId,
      canWork: context.user.ownStudentId === studentId,
      lesson,
    };
  });

export const answerQuiz = protectedProcedure
  .input(answerQuizSchema)
  .handler(async ({ context, input }) => {
    const studentId = await requireOwnStudent(context);
    await requireLearning(context);
    return managed(() =>
      repo.answerQuiz(context.db, input, studentId, context.today, new Date()),
    );
  });

export const completeLesson = protectedProcedure
  .input(completeLessonSchema)
  .handler(async ({ context, input }) => {
    const studentId = await requireOwnStudent(context);
    await requireLearning(context);
    return managed(() =>
      repo.completeLesson(
        context.db,
        input.lessonId,
        studentId,
        context.today,
        new Date(),
      ),
    );
  });
