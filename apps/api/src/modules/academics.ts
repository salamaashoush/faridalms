import {
  assignmentsForStudent,
  attendanceForStudent,
  attendanceSummary,
  currentSchoolYear,
  getAssignment,
  gradeAverage,
  gradesForStudent,
  resolveWeek,
  submitWork,
  timetableForClass,
  timetableForTeacher,
} from "@faridalms/database/repositories/academics";
import { getStudentSummary } from "@faridalms/database/repositories/students";
import {
  assignmentsQuerySchema,
  studentScopedQuerySchema,
  submitWorkSchema,
} from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import {
  requirePermission,
  assessmentScope,
  requireStudentAccess,
  visibleClassIds,
} from "../authorization";
import { protectedProcedure } from "../procedure";

export const getAssignments = protectedProcedure
  .input(assignmentsQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "assignments:read");
    const { studentId } = await requireStudentAccess(context, data.studentId);
    const year = await currentSchoolYear(context.db);
    const { week, weeks } = await resolveWeek(
      context.db,
      year.id,
      data.week,
      context.today,
    );

    return {
      today: context.today,
      studentId,
      week,
      weeks,
      rows: await assignmentsForStudent(context.db, studentId, {
        schoolYearId: year.id,
        today: context.today,
        weekId: week.id,
      }),
    };
  });

export const getAssignmentDetail = protectedProcedure
  .input(v.object({ id: v.string() }))
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "assignments:read");
    const row = await getAssignment(
      context.db,
      data.id,
      assessmentScope(context),
      user.studentIds,
    );
    if (!row) {
      throw new ORPCError("NOT_FOUND");
    }

    const allowedClasses = await visibleClassIds(context, user);
    const hasOwnHistory = row.submissions.some((submission) =>
      user.studentIds.includes(submission.studentId),
    );
    if (!allowedClasses.includes(row.classId) && !hasOwnHistory) {
      throw new ORPCError("NOT_FOUND");
    }

    return row;
  });

export const submitAssignment = protectedProcedure
  .input(submitWorkSchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "own-work:submit");
    if (!user.ownStudentId) {
      throw new Error("This account is not linked to a student record");
    }
    const allowed = await visibleClassIds(context, user);
    const assignment = await context.db.query.assignments.findFirst({
      where: { id: data.assignmentId, classId: { in: allowed } },
    });
    if (!assignment) throw new ORPCError("NOT_FOUND");
    const submitted = await submitWork(
      context.db,
      data.assignmentId,
      user.ownStudentId,
      data.content,
    );
    if (!submitted)
      throw new ORPCError("CONFLICT", {
        message: "This assignment has already been submitted",
      });
    return { submitted: true as const };
  });

export const getAttendance = protectedProcedure
  .input(studentScopedQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "attendance:read");
    const { studentId } = await requireStudentAccess(context, data.studentId);
    const [summary, rows] = await Promise.all([
      attendanceSummary(context.db, studentId),
      attendanceForStudent(context.db, studentId),
    ]);
    return { studentId, summary, rows };
  });

export const getGrades = protectedProcedure
  .input(studentScopedQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "grades:read");
    const { studentId } = await requireStudentAccess(context, data.studentId);
    const [rows, average] = await Promise.all([
      gradesForStudent(context.db, studentId),
      gradeAverage(context.db, studentId),
    ]);
    return { studentId, rows, average };
  });

export const getTimetable = protectedProcedure
  .input(studentScopedQuerySchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "timetable:read");

    if (user.role === "teacher") {
      return {
        today: context.today,
        studentId: null,
        className: null,
        slots: await timetableForTeacher(context.db, user.id),
      };
    }

    const { studentId } = await requireStudentAccess(context, data.studentId);
    const year = await currentSchoolYear(context.db);
    const summary = await getStudentSummary(context.db, studentId, {
      schoolYearId: year.id,
      today: context.today,
    });
    return {
      today: context.today,
      studentId,
      className: summary?.className ?? null,
      slots: summary?.classId
        ? await timetableForClass(context.db, summary.classId)
        : [],
    };
  });
