import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { getDb } from "~/db";
import {
  assignmentsForClasses,
  assignmentsForStudent,
  attendanceForClassOn,
  attendanceForStudent,
  attendanceSummary,
  currentSchoolYear,
  getAssignment,
  gradeAverage,
  gradeSubmission,
  gradesForStudent,
  gradingQueue,
  recordAttendance,
  resolveWeek,
  submitWork,
  timetableForClass,
  timetableForTeacher,
  TODAY,
  workloadFor,
} from "~/db/repositories/academics";
import {
  availableRecipients,
  eventsInRange,
  getMessageThread,
  listEvents,
  listMessages,
  listNewsletters,
  markRead,
  sendMessage as sendMessageRow,
  unreadCount,
  upcomingEvents,
} from "~/db/repositories/communication";
import {
  getClassDetail,
  listClasses,
  listSubjects,
  schoolAttendanceRate,
  schoolStats,
} from "~/db/repositories/school";
import {
  getStudentProfile,
  getStudentSummary,
  listAllUsers,
  listStudents,
} from "~/db/repositories/students";
import {
  assignmentsQuerySchema,
  attendanceRegisterQuerySchema,
  calendarQuerySchema,
  classScopedQuerySchema,
  composeMessageSchema,
  gradeSubmissionSchema,
  messagesQuerySchema,
  newslettersQuerySchema,
  recordAttendanceSchema,
  studentScopedQuerySchema,
  submitWorkSchema,
} from "~/schema/school";
import {
  requirePermission,
  requireStudentAccess,
  requireUser,
  visibleClassIds,
  visibleStudentIds,
} from "~/utils/session";

// --- shared -------------------------------------------------------------------

/** Students the signed-in user may switch between, for the header picker. */
export const getVisibleStudents = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    const ids = await visibleStudentIds(user);
    return listStudents(ids);
  },
);

export const getStudent = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(async ({ data }) => {
    const { studentId } = await requireStudentAccess(data.studentId);
    const profile = await getStudentProfile(studentId);
    if (!profile) {
      // Router-aware: the route renders its notFoundComponent instead of the
      // error boundary, and SSR responds 404 rather than 200.
      throw notFound();
    }
    return { today: TODAY, profile };
  });

// --- family and student overviews ---------------------------------------------

export const getFamilyOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requirePermission("children:read");
    const ids = await visibleStudentIds(user);
    const students = await listStudents(ids);
    const year = await currentSchoolYear();

    const overviews = await Promise.all(
      students.map(async (student) => {
        const [attendance, average, workload] = await Promise.all([
          attendanceSummary(student.id),
          gradeAverage(student.id),
          workloadFor(student.id),
        ]);
        return { student, attendance, average, ...workload };
      }),
    );

    const [unread, upcoming] = await Promise.all([
      unreadCount(user.id),
      upcomingEvents(year.id, TODAY, 5),
    ]);

    return { today: TODAY, schoolYear: year.name, overviews, unread, upcoming };
  },
);

export const getStudentOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requirePermission("own-work:read");
    const studentId = user.ownStudentId;
    if (!studentId) {
      throw notFound();
    }

    const year = await currentSchoolYear();
    const { week } = await resolveWeek(year.id, undefined);

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
      getStudentSummary(studentId),
      attendanceSummary(studentId),
      gradeAverage(studentId),
      workloadFor(studentId),
      assignmentsForStudent(studentId, { weekId: week.id }),
      unreadCount(user.id),
      upcomingEvents(year.id, TODAY, 5),
      (async () => {
        const summary = await getStudentSummary(studentId);
        return summary?.classId ? timetableForClass(summary.classId) : [];
      })(),
    ]);

    return {
      today: TODAY,
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

// --- teaching -----------------------------------------------------------------

export const getTeachingOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requirePermission("roster:read");
    const classIds = await visibleClassIds(user);
    const year = await currentSchoolYear();
    const { week, weeks } = await resolveWeek(year.id, undefined);

    const [classes, queue, assignments, unread, upcoming, timetable] =
      await Promise.all([
        listClasses(classIds),
        gradingQueue(classIds),
        assignmentsForClasses(classIds, week.id),
        unreadCount(user.id),
        upcomingEvents(year.id, TODAY, 5),
        timetableForTeacher(user.id),
      ]);

    return {
      today: TODAY,
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

export const getMyClasses = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requirePermission("classes:read");
    return listClasses(await visibleClassIds(user));
  },
);

export const getClass = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(v.object({ id: v.string() }), input))
  .handler(async ({ data }) => {
    const user = await requirePermission("classes:read");
    const allowed = await visibleClassIds(user);
    if (!allowed.includes(data.id)) {
      throw notFound();
    }
    const detail = await getClassDetail(data.id);
    if (!detail) {
      throw notFound();
    }
    return detail;
  });

export const getClassAssignments = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(classScopedQuerySchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("classes:read");
    const allowed = await visibleClassIds(user);
    const classIds =
      data.classId && allowed.includes(data.classId) ? [data.classId] : allowed;
    const year = await currentSchoolYear();
    const { week, weeks } = await resolveWeek(year.id, data.week);

    return {
      classId: data.classId || null,
      week,
      weeks,
      rows: await assignmentsForClasses(classIds, week.id),
    };
  });

export const getGradingQueue = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requirePermission("submissions:grade");
    return gradingQueue(await visibleClassIds(user));
  },
);

export const submitGrade = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(gradeSubmissionSchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("submissions:grade");
    await gradeSubmission(data.submissionId, {
      score: data.score,
      feedback: data.feedback || null,
      gradedById: user.id,
    });
    return { graded: true as const };
  });

export const getAttendanceRegister = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(attendanceRegisterQuerySchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("attendance:record");
    const allowed = await visibleClassIds(user);
    const classId =
      data.classId && allowed.includes(data.classId)
        ? data.classId
        : allowed[0];
    if (!classId) {
      return { classId: null, date: data.date || TODAY, roster: [], marks: [] };
    }

    const date = data.date || TODAY;
    const [detail, marks] = await Promise.all([
      getClassDetail(classId),
      attendanceForClassOn(classId, date),
    ]);

    return { classId, date, roster: detail?.roster ?? [], marks };
  });

export const saveAttendance = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(recordAttendanceSchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("attendance:record");
    const allowed = await visibleClassIds(user);
    if (!allowed.includes(data.classId)) {
      throw new Error("Forbidden: that class is not yours to register");
    }

    await recordAttendance(
      data.entries.map((entry) => ({
        studentId: entry.studentId,
        classId: data.classId,
        date: data.date,
        status: entry.status,
        note: entry.note || null,
      })),
      user.id,
    );
    return { saved: data.entries.length };
  });

// --- administration -----------------------------------------------------------

export const getAdminOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    await requirePermission("school:manage");
    const year = await currentSchoolYear();
    const [stats, rate, classes, upcoming] = await Promise.all([
      schoolStats(),
      schoolAttendanceRate(),
      listClasses(),
      upcomingEvents(year.id, TODAY, 6),
    ]);
    return {
      today: TODAY,
      schoolYear: year.name,
      stats,
      attendanceRate: rate,
      classes,
      upcoming,
    };
  },
);

export const getAllStudents = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requirePermission("users:read");
    return listStudents(await visibleStudentIds(user));
  },
);

export const getAllUsers = createServerFn({ method: "GET" }).handler(
  async () => {
    await requirePermission("users:read");
    return listAllUsers();
  },
);

export const getAllClasses = createServerFn({ method: "GET" }).handler(
  async () => {
    await requirePermission("classes:read");
    return listClasses();
  },
);

export const getSubjects = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireUser();
    return listSubjects();
  },
);

export const getSchoolSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    await requirePermission("school:manage");
    const year = await currentSchoolYear();
    const terms = await getDb().query.terms.findMany({
      where: { schoolYearId: year.id },
      orderBy: { startsOn: "asc" },
      columns: { id: true, name: true, startsOn: true, endsOn: true },
    });

    return {
      year: { name: year.name, startsOn: year.startsOn, endsOn: year.endsOn },
      terms,
    };
  },
);

// --- academics, scoped to one student -----------------------------------------

export const getAssignments = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(assignmentsQuerySchema, input))
  .handler(async ({ data }) => {
    const { studentId } = await requireStudentAccess(data.studentId);
    const year = await currentSchoolYear();
    const { week, weeks } = await resolveWeek(year.id, data.week);

    return {
      today: TODAY,
      studentId,
      week,
      weeks,
      rows: await assignmentsForStudent(studentId, { weekId: week.id }),
    };
  });

export const getAssignmentDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(v.object({ id: v.string() }), input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const row = await getAssignment(data.id);
    if (!row) {
      throw notFound();
    }

    const allowedClasses = await visibleClassIds(user);
    if (!allowedClasses.includes(row.classId)) {
      throw notFound();
    }

    // A family sees only their own child's submission, never the class's.
    if (user.role === "parent" || user.role === "student") {
      const mine = await visibleStudentIds(user);
      return {
        ...row,
        submissions: row.submissions.filter((s) => mine.includes(s.studentId)),
      };
    }
    return row;
  });

export const submitAssignment = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(submitWorkSchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("own-work:submit");
    if (!user.ownStudentId) {
      throw new Error("This account is not linked to a student record");
    }
    await submitWork(data.assignmentId, user.ownStudentId);
    return { submitted: true as const };
  });

export const getAttendance = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(async ({ data }) => {
    const { studentId } = await requireStudentAccess(data.studentId);
    const [summary, rows] = await Promise.all([
      attendanceSummary(studentId),
      attendanceForStudent(studentId),
    ]);
    return { studentId, summary, rows };
  });

export const getGrades = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(async ({ data }) => {
    const { studentId } = await requireStudentAccess(data.studentId);
    const [rows, average] = await Promise.all([
      gradesForStudent(studentId),
      gradeAverage(studentId),
    ]);
    return { studentId, rows, average };
  });

export const getTimetable = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(async ({ data }) => {
    const user = await requireUser();

    if (user.role === "teacher") {
      return {
        today: TODAY,
        studentId: null,
        className: null,
        slots: await timetableForTeacher(user.id),
      };
    }

    const { studentId } = await requireStudentAccess(data.studentId);
    const summary = await getStudentSummary(studentId);
    return {
      today: TODAY,
      studentId,
      className: summary?.className ?? null,
      slots: summary?.classId ? await timetableForClass(summary.classId) : [],
    };
  });

// --- communication ------------------------------------------------------------

export const getMessages = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(messagesQuerySchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("messages:read");
    const [rows, unread] = await Promise.all([
      listMessages(user.id, data.folder, data.q),
      unreadCount(user.id),
    ]);
    return { folder: data.folder, rows, unread };
  });

export const getMessage = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(v.object({ id: v.string() }), input))
  .handler(async ({ data }) => {
    const user = await requirePermission("messages:read");
    const thread = await getMessageThread(data.id, user.id);
    if (!thread) {
      throw notFound();
    }
    // Opening it is what marks it read, and only for this reader.
    await markRead(data.id, user.id);
    return thread;
  });

export const getRecipients = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    v.parse(
      v.object({
        category: v.picklist(["teachers", "administration"] as const),
      }),
      input,
    ),
  )
  .handler(async ({ data }) => {
    await requirePermission("messages:send");
    return availableRecipients(data.category);
  });

export const sendMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(composeMessageSchema, input))
  .handler(async ({ data }) => {
    const user = await requirePermission("messages:send");

    // A sender may only attach a child they are allowed to see.
    let studentId: string | null = null;
    if (data.studentId) {
      const access = await requireStudentAccess(data.studentId);
      studentId = access.studentId;
    }

    const id = await sendMessageRow({
      senderId: user.id,
      category: data.category,
      studentId,
      subject: data.subject,
      body: data.body,
      recipientIds: [data.recipientId],
    });
    return { id };
  });

export const getNewsletters = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(newslettersQuerySchema, input))
  .handler(async ({ data }) => {
    await requirePermission("newsletters:read");
    return { rows: await listNewsletters(data.q) };
  });

export const getCalendar = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(calendarQuerySchema, input))
  .handler(async ({ data }) => {
    await requirePermission("calendar:read");
    const year = await currentSchoolYear();
    const month = data.month || TODAY.slice(0, 7);
    const [yearPart = "2026", monthPart = "09"] = month.split("-");
    const lastDay = new Date(
      Date.UTC(Number(yearPart), Number(monthPart), 0),
    ).getUTCDate();

    const [monthRange, allEvents] = await Promise.all([
      eventsInRange(
        year.id,
        `${month}-01`,
        `${month}-${String(lastDay).padStart(2, "0")}`,
      ),
      listEvents(year.id, data.categories),
    ]);

    // The grid honours the same category filter as the agenda. Returning the
    // whole month made the client re-filter what the server already knew.
    const monthEvents =
      data.categories.length === 0
        ? monthRange
        : monthRange.filter((event) =>
            data.categories.includes(event.category),
          );

    return { month, today: TODAY, monthEvents, allEvents };
  });
