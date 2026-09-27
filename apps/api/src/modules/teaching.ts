import {
  assignmentsForClasses,
  currentSchoolYear,
  gradingQueue,
  resolveWeek,
  timetableForTeacher,
} from "@faridalms/database/repositories/academics";
import {
  unreadCount,
  upcomingEvents,
} from "@faridalms/database/repositories/communication";
import { listClasses } from "@faridalms/database/repositories/school";

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
