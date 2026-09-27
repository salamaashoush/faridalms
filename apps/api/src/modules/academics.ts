import {
  assignmentsForStudent,
  attendanceForStudent,
  attendanceSummary,
  currentSchoolYear,
  gradeAverage,
  gradesForStudent,
  resolveWeek,
  timetableForClass,
  timetableForTeacher,
} from "@faridalms/database/repositories/academics";
import { getStudentSummary } from "@faridalms/database/repositories/students";
import {
  assignmentsQuerySchema,
  studentScopedQuerySchema,
} from "@faridalms/domain/school-schema";

import { requirePermission, requireStudentAccess } from "../authorization";
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
