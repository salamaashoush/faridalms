import {
  assignmentsForClasses,
  attendanceForClassOn,
  currentSchoolYear,
  gradingQueue,
  recordAttendance,
  resolveWeek,
  timetableForTeacher,
} from "@faridalms/database/repositories/academics";
import {
  unreadCount,
  upcomingEvents,
} from "@faridalms/database/repositories/communication";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  getClassDetail,
  listClasses,
} from "@faridalms/database/repositories/school";
import {
  attendanceRegisterQuerySchema,
  recordAttendanceSchema,
} from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";

import {
  assessmentScope,
  requirePermission,
  visibleClassIds,
} from "../authorization";
import { protectedProcedure } from "../procedure";

export const getTeachingOverview = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "roster:read");
    const classIds = await visibleClassIds(context, user);
    const year = await currentSchoolYear(context.db);
    const { week, weeks } = await resolveWeek(
      context.db,
      year.id,
      undefined,
      context.today,
    );

    const [classes, queue, assignments, unread, upcoming, timetable] =
      await Promise.all([
        listClasses(
          context.db,
          classIds,
          assessmentScope(context, "assignments:author"),
        ),
        gradingQueue(context.db, classIds, assessmentScope(context)),
        assignmentsForClasses(
          context.db,
          classIds,
          assessmentScope(context),
          week.id,
        ),
        unreadCount(context.db, user.id),
        upcomingEvents(context.db, year.id, context.today, 5),
        timetableForTeacher(context.db, user.id),
      ]);

    return {
      today: context.today,
      week,
      weeks,
      classes,
      queue,
      assignments,
      unread,
      upcoming,
      timetable,
    };
  },
);

export const getMyClasses = protectedProcedure.handler(async ({ context }) => {
  const user = await requirePermission(context, "classes:read");
  return listClasses(
    context.db,
    await visibleClassIds(context, user),
    assessmentScope(context, "assignments:author"),
  );
});

export const getAttendanceRegister = protectedProcedure
  .input(attendanceRegisterQuerySchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "attendance:record");
    const allowed = await visibleClassIds(context, user);
    if (data.classId && !allowed.includes(data.classId))
      throw new ORPCError("FORBIDDEN");
    const classId =
      data.classId && allowed.includes(data.classId)
        ? data.classId
        : allowed[0];
    if (!classId) {
      return {
        classId: null,
        date: data.date || context.today,
        roster: [],
        marks: [],
        dateIssue: null,
        startsOn: null,
        endsOn: null,
        today: context.today,
      };
    }

    const date = data.date || context.today;
    const [detail, marks] = await Promise.all([
      getClassDetail(context.db, classId, date),
      attendanceForClassOn(context.db, classId, date),
    ]);

    if (!detail) throw new ORPCError("NOT_FOUND");
    const outsideYear =
      !detail.yearStartsOn ||
      !detail.yearEndsOn ||
      date < detail.yearStartsOn ||
      date > detail.yearEndsOn;
    const dateIssue = outsideYear
      ? "outside_year"
      : date > context.today
        ? "future_date"
        : null;
    return {
      classId,
      date,
      roster: dateIssue ? [] : detail.roster,
      marks: dateIssue ? [] : marks,
      dateIssue,
      startsOn: detail.yearStartsOn,
      endsOn: detail.yearEndsOn,
      today: context.today,
    };
  });

export const saveAttendance = protectedProcedure
  .input(recordAttendanceSchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "attendance:record");
    const allowed = await visibleClassIds(context, user);
    if (!allowed.includes(data.classId)) {
      throw new ORPCError("FORBIDDEN");
    }

    try {
      const marks = await recordAttendance(
        context.db,
        data,
        user.id,
        user.role === "admin"
          ? { kind: "school" }
          : { kind: "teacher", userId: user.id },
        context.today,
      );
      return { saved: marks.length, marks };
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });
