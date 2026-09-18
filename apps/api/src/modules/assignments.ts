import { listWeeks } from "@faridalms/database/repositories/academics";
import {
  archiveAssignment as archiveRow,
  assignmentWorkspace,
  attemptForReview,
  authoringAssignment,
  deleteDraftAssignment as deleteDraftRow,
  publishAssignment as publishRow,
  saveAssignment as saveRow,
} from "@faridalms/database/repositories/assignments";
import {
  deleteGroup,
  listGroups,
  saveGroup,
} from "@faridalms/database/repositories/groups";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  getClassDetail,
  listClasses,
} from "@faridalms/database/repositories/school";
import {
  assessAttempt as assessRow,
  learnerAssignment,
  saveSubmissionDraft as saveDraftRow,
  submitAttempt as submitRow,
} from "@faridalms/database/repositories/submissions";
import {
  assessAttemptSchema,
  assignmentRevisionSchema,
  saveAssignmentSchema,
  saveStudentGroupSchema,
  saveSubmissionDraftSchema,
  submitAttemptSchema,
} from "@faridalms/domain/assignment";
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

const id = v.pipe(v.string(), v.uuid());

async function manage<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

async function requireClass(context: SchoolContext, classId: string) {
  const classes = await visibleClassIds(context, context.user);
  if (!classes.includes(classId)) throw new ORPCError("FORBIDDEN");
}

function author(context: SchoolContext) {
  return {
    userId: context.user.id,
    scope: assessmentScope(context, "assignments:author"),
  };
}

/** Classes, subjects, roster and groups the designer can choose from. */
export const getAuthoringContext = protectedProcedure
  .input(v.object({ classId: v.optional(v.union([v.literal(""), id]), "") }))
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "assignments:author");
    const classIds = await visibleClassIds(context, user);
    const classes = (
      await listClasses(context.db, classIds, author(context).scope)
    ).filter((row) => row.authoringSubjects.length > 0);
    const selected = input.classId
      ? classes.find((row) => row.id === input.classId)
      : classes[0];
    const detail = selected
      ? await getClassDetail(context.db, selected.id, context.today)
      : undefined;
    return {
      today: context.today,
      timeZone: context.school.timeZone,
      classes,
      classId: selected?.id ?? "",
      roster: detail?.roster ?? [],
      groups: selected ? await listGroups(context.db, selected.id) : [],
      weeks: detail
        ? await listWeeks(
            context.db,
            (
              await context.db.query.classes.findFirst({
                where: { id: selected?.id },
                columns: { schoolYearId: true },
              })
            )?.schoolYearId ?? "",
          )
        : [],
    };
  });

export const getAuthoringAssignment = protectedProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    const row = await authoringAssignment(
      context.db,
      input.id,
      author(context).scope,
    );
    if (!row) throw new ORPCError("NOT_FOUND");
    await requireClass(context, row.classId);
    return row;
  });

export const saveAssignment = protectedProcedure
  .input(saveAssignmentSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    await requireClass(context, input.classId);
    return manage(() =>
      saveRow(context.db, input, author(context), {
        today: context.today,
        timeZone: context.school.timeZone,
      }),
    );
  });

export const publishAssignment = protectedProcedure
  .input(assignmentRevisionSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    return manage(() =>
      publishRow(context.db, input.id, input.expectedRevision, author(context)),
    );
  });

export const archiveAssignment = protectedProcedure
  .input(assignmentRevisionSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    return manage(() =>
      archiveRow(context.db, input.id, input.expectedRevision, author(context)),
    );
  });

export const deleteDraftAssignment = protectedProcedure
  .input(assignmentRevisionSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    return manage(() =>
      deleteDraftRow(
        context.db,
        input.id,
        input.expectedRevision,
        author(context),
      ),
    );
  });

/** The assessor's record page: brief, audience and each learner's state. */
export const getAssignmentWorkspace = protectedProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "assignments:read");
    if (!user.permissions.includes("roster:read"))
      throw new ORPCError("FORBIDDEN");
    const row = await assignmentWorkspace(
      context.db,
      input.id,
      assessmentScope(context),
      new Date(),
      context.today,
    );
    if (!row?.class) throw new ORPCError("NOT_FOUND");
    const classes = await visibleClassIds(context, user);
    if (!classes.includes(row.class.id)) throw new ORPCError("NOT_FOUND");
    if (row.status === "draft" && !row.canAssess)
      throw new ORPCError("NOT_FOUND");
    return {
      ...row,
      today: context.today,
      timeZone: context.school.timeZone,
      canAuthor:
        row.canAssess && user.permissions.includes("assignments:author"),
    };
  });

export const getAttemptForReview = protectedProcedure
  .input(v.object({ attemptId: id }))
  .handler(async ({ input, context }) => {
    await requirePermission(context, "submissions:grade");
    const row = await attemptForReview(
      context.db,
      input.attemptId,
      assessmentScope(context),
    );
    if (!row) throw new ORPCError("NOT_FOUND");
    return row;
  });

export const assessAttempt = protectedProcedure
  .input(assessAttemptSchema)
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "submissions:grade");
    return manage(() =>
      assessRow(
        context.db,
        input,
        { userId: user.id, scope: assessmentScope(context) },
        new Date(),
      ),
    );
  });

/** The learner's or guardian's record page for one assignment. */
export const getLearnerAssignment = protectedProcedure
  .input(v.object({ id, studentId: v.optional(v.string(), "") }))
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "assignments:read");
    if (user.role === "teacher" || user.role === "admin")
      throw new ORPCError("FORBIDDEN");
    const { studentId } = await requireStudentAccess(context, input.studentId);
    const row = await learnerAssignment(
      context.db,
      input.id,
      studentId,
      new Date(),
      context.today,
    );
    if (!row) throw new ORPCError("NOT_FOUND");
    const own =
      user.ownStudentId === studentId &&
      user.permissions.includes("own-work:submit");
    return {
      ...row,
      studentId,
      today: context.today,
      timeZone: context.school.timeZone,
      canEdit: own && row.canSubmit,
    };
  });

function learner(context: SchoolContext) {
  if (!context.user.ownStudentId)
    throw new ORPCError("FORBIDDEN", {
      message: "This account is not linked to a student record",
    });
  return { userId: context.user.id, studentId: context.user.ownStudentId };
}

export const saveSubmissionDraft = protectedProcedure
  .input(saveSubmissionDraftSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "own-work:submit");
    return manage(() =>
      saveDraftRow(
        context.db,
        input,
        learner(context),
        new Date(),
        context.today,
      ),
    );
  });

export const submitAttempt = protectedProcedure
  .input(submitAttemptSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "own-work:submit");
    return manage(() =>
      submitRow(context.db, input, learner(context), new Date(), context.today),
    );
  });

export const getStudentGroups = protectedProcedure
  .input(v.object({ classId: id }))
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    await requireClass(context, input.classId);
    return listGroups(context.db, input.classId);
  });

export const saveStudentGroup = protectedProcedure
  .input(saveStudentGroupSchema)
  .handler(async ({ input, context }) => {
    const user = await requirePermission(context, "assignments:author");
    await requireClass(context, input.classId);
    return manage(() => saveGroup(context.db, input, user.id, context.today));
  });

export const deleteStudentGroup = protectedProcedure
  .input(v.object({ id, classId: id }))
  .handler(async ({ input, context }) => {
    await requirePermission(context, "assignments:author");
    await requireClass(context, input.classId);
    await manage(() => deleteGroup(context.db, input.id, input.classId));
    return { deleted: true as const };
  });
