import {
  assignmentsForStudent,
  attendanceSummary,
  currentSchoolYear,
  gradeAverage,
  resolveWeek,
  timetableForClass,
  workloadFor,
} from "@faridalms/database/repositories/academics";
import {
  unreadCount,
  upcomingEvents,
} from "@faridalms/database/repositories/communication";
import {
  getStudentSummary,
  listStudents,
} from "@faridalms/database/repositories/students";
import { ORPCError } from "@orpc/server";

import { requirePermission, visibleStudentIds } from "../authorization";
import { protectedProcedure } from "../procedure";

export const getFamilyOverview = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "children:read");
    const ids = await visibleStudentIds(context, user);
    const year = await currentSchoolYear(context.db);
    const students = await listStudents(context.db, ids, {
      schoolYearId: year.id,
      today: context.today,
    });

    const overviews = await Promise.all(
      students.map(async (student) => {
        const [attendance, average, workload] = await Promise.all([
          attendanceSummary(context.db, student.id),
          gradeAverage(context.db, student.id),
          workloadFor(context.db, student.id, context.today, year.id),
        ]);
        return { student, attendance, average, ...workload };
      }),
    );

    const [unread, upcoming] = await Promise.all([
      unreadCount(context.db, user.id),
      upcomingEvents(context.db, year.id, context.today, 5),
    ]);

    return {
      today: context.today,
      schoolYear: year.name,
      overviews,
      unread,
      upcoming,
    };
  },
);

export const getStudentOverview = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "own-work:read");
    const studentId = user.ownStudentId;
    if (!studentId) {
      throw new ORPCError("NOT_FOUND");
    }

    const year = await currentSchoolYear(context.db);
    const { week } = await resolveWeek(
      context.db,
      year.id,
      undefined,
      context.today,
    );

    const [
      student,
      attendance,
      average,
      workload,
      assignments,
      unread,
      upcoming,
      timetable,
    ] = await Promise.all([
      getStudentSummary(context.db, studentId, {
        schoolYearId: year.id,
        today: context.today,
      }),
      attendanceSummary(context.db, studentId),
      gradeAverage(context.db, studentId),
      workloadFor(context.db, studentId, context.today, year.id),
      assignmentsForStudent(context.db, studentId, {
        schoolYearId: year.id,
        weekId: week.id,
        today: context.today,
      }),
      unreadCount(context.db, user.id),
      upcomingEvents(context.db, year.id, context.today, 5),
      (async () => {
        const summary = await getStudentSummary(context.db, studentId, {
          schoolYearId: year.id,
          today: context.today,
        });
        return summary?.classId
          ? timetableForClass(context.db, summary.classId)
          : [];
      })(),
    ]);

    return {
      today: context.today,
      schoolYear: year.name,
      student,
      attendance,
      average,
      ...workload,
      assignments,
      unread,
      upcoming,
      timetable,
    };
  },
);
