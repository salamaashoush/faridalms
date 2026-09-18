import {
  assignmentsForClasses,
  assessmentFilter,
  attendanceForClassOn,
  currentSchoolYear,
  gradingQueue,
  recordAttendance,
  resolveWeek,
  timetableForTeacher,
} from "@faridalms/database/repositories/academics";
import {
  publishAssignment,
  saveAssignment,
} from "@faridalms/database/repositories/assignments";
import {
  unreadCount,
  upcomingEvents,
} from "@faridalms/database/repositories/communication";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  getClassDetail,
  listClasses,
} from "@faridalms/database/repositories/school";
import { assessAttempt } from "@faridalms/database/repositories/submissions";
import { plainContent } from "@faridalms/domain/content-conversion";
import { zonedInstant } from "@faridalms/domain/school";
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
        data.status === "all" ? undefined : data.status,
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

/** Quick grading of the latest attempt with a plain-text comment. */
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
      with: { assignment: { columns: { maxScore: true, rubric: true } } },
    });
    if (!submission?.assignment || !submission.currentAttemptId)
      throw new ORPCError("NOT_FOUND");
    if (data.score > submission.assignment.maxScore)
      throw new ORPCError("BAD_REQUEST", {
        message: "Score exceeds the assignment maximum",
      });
    if (submission.assignment.rubric.length)
      throw new ORPCError("BAD_REQUEST", {
        message: "assessment.rubric_required",
      });
    try {
      await assessAttempt(
        context.db,
        {
          attemptId: submission.currentAttemptId,
          score: data.score,
          rubricScores: [],
          feedback: data.feedback ? plainContent(data.feedback) : null,
          release: true,
        },
        { userId: user.id, name: user.name, scope: assessmentScope(context) },
        new Date(),
      );
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
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

/**
 * One-step publication for simple written work: the designer's model with
 * its defaults, published to the whole class and due at the end of the day.
 */
export const createAssignment = protectedProcedure
  .input(createAssignmentSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "assignments:author");
    const classes = await visibleClassIds(context, user);
    if (!classes.includes(input.classId)) throw new ORPCError("FORBIDDEN");
    if (input.dueDate < context.today)
      throw new ORPCError("BAD_REQUEST", {
        message: "The due date must not be in the past",
      });
    const actor = {
      userId: user.id,
      name: user.name,
      scope: assessmentScope(context, "assignments:author"),
    };
    try {
      const draft = await saveAssignment(
        context.db,
        {
          id: crypto.randomUUID(),
          expectedRevision: 0,
          classId: input.classId,
          subjectId: input.subjectId,
          type: "written_assignment",
          title: input.title,
          instructions: plainContent(input.description),
          resourceFileIds: [],
          recipients: { mode: "class", groupIds: [], studentIds: [] },
          availableFrom: "",
          dueAt: zonedInstant(
            input.dueDate,
            "23:59",
            context.school.timeZone,
          ).toISOString(),
          closesAt: "",
          latePolicy: "not_accepted",
          lateDeductionPercent: 0,
          submissionFormat: "written",
          maxAttachments: 0,
          maxAttachmentBytes: 10 * 1024 * 1024,
          resubmission: "not_allowed",
          maxScore: input.maxScore,
          rubric: [],
        },
        actor,
        { today: context.today, timeZone: context.school.timeZone },
      );
      const published = await publishAssignment(
        context.db,
        draft.id,
        draft.revision,
        actor,
      );
      return { id: published.id };
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });
