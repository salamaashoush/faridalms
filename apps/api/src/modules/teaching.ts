import { schema } from "@faridalms/database";
import {
  assignmentsForClasses,
  assessmentFilter,
  attendanceForClassOn,
  currentSchoolYear,
  gradeSubmission,
  gradingQueue,
  listWeeks,
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
import { canAssessOffering } from "@faridalms/domain/academic-access";
import { weekForDate } from "@faridalms/domain/school";
import {
  createAssignmentSchema,
  attendanceRegisterQuerySchema,
  classScopedQuerySchema,
  gradeSubmissionSchema,
  recordAttendanceSchema,
} from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

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

export const getClass = protectedProcedure
  .input(v.object({ id: v.string() }))
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(
      context,
      context.user.permissions.includes("classes:read")
        ? "classes:read"
        : "student-profile:read",
    );
    const allowed = await visibleClassIds(context, user);
    if (!allowed.includes(data.id)) {
      throw new ORPCError("NOT_FOUND");
    }
    const detail = await getClassDetail(context.db, data.id, context.today);
    if (!detail) {
      throw new ORPCError("NOT_FOUND");
    }
    return {
      ...detail,
      roster: user.permissions.includes("roster:read")
        ? detail.roster
        : detail.roster.filter((student) =>
            user.studentIds.includes(student.id),
          ),
      canManage: user.permissions.includes("classes:manage"),
    };
  });

export const getClassAssignments = protectedProcedure
  .input(classScopedQuerySchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "assignments:read");
    const allowed = await visibleClassIds(context, user);
    if (data.classId && !allowed.includes(data.classId))
      throw new ORPCError("FORBIDDEN");
    const classIds =
      data.classId && allowed.includes(data.classId) ? [data.classId] : allowed;
    const year = await currentSchoolYear(context.db);
    const { week, weeks } = await resolveWeek(
      context.db,
      year.id,
      data.week,
      context.today,
    );

    return {
      today: context.today,
      classId: data.classId || null,
      week,
      weeks,
      rows: await assignmentsForClasses(
        context.db,
        classIds,
        assessmentScope(context),
        week.id,
      ),
    };
  });

export const getGradingQueue = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "submissions:grade");
    return gradingQueue(
      context.db,
      await visibleClassIds(context, user),
      assessmentScope(context),
    );
  },
);

export const submitGrade = protectedProcedure
  .input(gradeSubmissionSchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "submissions:grade");
    const allowed = await visibleClassIds(context, user);
    const submission = await context.db.query.submissions.findFirst({
      where: {
        id: data.submissionId,
        assignment: {
          classId: { in: allowed },
          RAW: (table) => assessmentFilter(table, assessmentScope(context)),
        },
      },
      with: { assignment: { columns: { maxScore: true } } },
    });
    if (!submission?.assignment) throw new ORPCError("NOT_FOUND");
    if (data.score > submission.assignment.maxScore)
      throw new ORPCError("BAD_REQUEST", {
        message: "Score exceeds the assignment maximum",
      });
    const graded = await gradeSubmission(
      context.db,
      data.submissionId,
      {
        score: data.score,
        feedback: data.feedback || null,
        gradedById: user.id,
      },
      assessmentScope(context),
    );
    if (!graded) throw new ORPCError("NOT_FOUND");
    return { graded: true as const };
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

export const createAssignment = protectedProcedure
  .input(createAssignmentSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "assignments:author");
    const classes = await visibleClassIds(context, user);
    if (!classes.includes(input.classId)) throw new ORPCError("FORBIDDEN");
    const subject = await context.db.query.classSubjects.findFirst({
      where: { classId: input.classId, subjectId: input.subjectId },
      with: { class: { columns: { schoolYearId: true } } },
    });
    if (!subject)
      throw new ORPCError("BAD_REQUEST", {
        message: "The subject is not taught in this class",
      });
    if (
      !canAssessOffering(
        assessmentScope(context, "assignments:author"),
        subject.teacherId,
      )
    ) {
      throw new ORPCError("FORBIDDEN");
    }
    if (input.dueDate < context.today)
      throw new ORPCError("BAD_REQUEST", {
        message: "The due date must not be in the past",
      });
    if (!subject.class) throw new ORPCError("NOT_FOUND");
    const week = weekForDate(
      await listWeeks(context.db, subject.class.schoolYearId),
      input.dueDate,
    );
    const [assignment] = await context.db
      .insert(schema.assignments)
      .values({
        ...input,
        authorId: user.id,
        assignedOn: context.today,
        type: "written_assignment",
        publishedAt: new Date(),
        weekId: week?.id ?? null,
      })
      .returning({ id: schema.assignments.id });
    if (!assignment) throw new ORPCError("INTERNAL_SERVER_ERROR");
    return assignment;
  });
