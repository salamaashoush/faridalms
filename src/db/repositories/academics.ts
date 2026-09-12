import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb, schema } from "~/db";
import { addDays, TODAY } from "~/utils/school";

export { addDays, TODAY };

export async function currentSchoolYear() {
  const row = await getDb().query.schoolYears.findFirst({
    where: { isCurrent: true },
  });
  if (!row) {
    throw new Error("No school year is marked current");
  }
  return row;
}

export async function listWeeks(schoolYearId: string) {
  return getDb().query.academicWeeks.findMany({
    where: { schoolYearId },
    orderBy: { number: "asc" },
  });
}

/** The week containing `today`, else the next one, else the last. */
export async function resolveWeek(
  schoolYearId: string,
  requested: number | undefined,
  today = TODAY,
) {
  const weeks = await listWeeks(schoolYearId);
  if (requested !== undefined) {
    const match = weeks.find((week) => week.number === requested);
    if (match) {
      return { week: match, weeks };
    }
  }
  const containing = weeks.find(
    (week) => week.startsOn <= today && today <= week.endsOn,
  );
  const upcoming = weeks.find((week) => week.startsOn > today);
  const week = containing ?? upcoming ?? weeks.at(-1);
  if (!week) {
    throw new Error("The current school year has no academic weeks");
  }
  return { week, weeks };
}

export interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  type: (typeof schema.assignmentTypeEnum.enumValues)[number];
  assignedOn: string;
  dueDate: string;
  maxScore: number;
  subject: {
    id: string;
    slug: string;
    name: string;
    nameAr: string;
    icon: string;
  };
  className: string;
  classId: string;
  teacher: string | null;
  weekNumber: number | null;
  submission: {
    state: (typeof schema.submissionStateEnum.enumValues)[number];
    score: number | null;
    feedback: string | null;
    submittedAt: Date | null;
  } | null;
}

/**
 * Assignments for one student, with that student's own submission attached.
 *
 * Scoped by student rather than by class so the caller never has to filter a
 * whole class's submissions client-side.
 */
export async function assignmentsForStudent(
  studentId: string,
  options: { weekId?: string; classId?: string } = {},
): Promise<AssignmentRow[]> {
  const db = getDb();

  const enrolment = await db.query.enrolments.findFirst({
    where: { studentId },
    columns: { classId: true },
  });
  const classId = options.classId ?? enrolment?.classId;
  if (!classId) {
    return [];
  }

  const rows = await db.query.assignments.findMany({
    where: {
      classId,
      ...(options.weekId ? { weekId: options.weekId } : {}),
    },
    with: {
      subject: true,
      week: { columns: { number: true } },
      class: { columns: { id: true, name: true } },
      author: { columns: { name: true } },
      submissions: { where: { studentId } },
    },
    orderBy: { dueDate: "asc" },
  });

  return rows.flatMap((row) => {
    // `subject` and `class` are required foreign keys, but the relational
    // builder types every joined row as nullable. Skipping rather than
    // asserting means a future nullable FK degrades instead of throwing.
    if (!row.subject || !row.class) {
      return [];
    }
    const submission = row.submissions[0];
    return [
      {
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        assignedOn: row.assignedOn,
        dueDate: row.dueDate,
        maxScore: row.maxScore,
        subject: row.subject,
        className: row.class.name,
        classId: row.class.id,
        teacher: row.author?.name ?? null,
        weekNumber: row.week?.number ?? null,
        submission: submission
          ? {
              state: submission.state,
              score: submission.score,
              feedback: submission.feedback,
              submittedAt: submission.submittedAt,
            }
          : null,
      },
    ];
  });
}

export async function assignmentsForClasses(
  classIds: string[],
  weekId?: string,
) {
  if (classIds.length === 0) {
    return [];
  }
  return getDb().query.assignments.findMany({
    where: {
      classId: { in: classIds },
      ...(weekId ? { weekId } : {}),
    },
    with: {
      subject: { columns: { name: true, slug: true, icon: true } },
      class: { columns: { id: true, name: true } },
      week: { columns: { number: true } },
      submissions: {
        columns: { id: true, state: true, score: true },
        with: {
          student: { columns: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function getAssignment(id: string) {
  return getDb().query.assignments.findFirst({
    where: { id },
    with: {
      subject: true,
      class: { columns: { id: true, name: true } },
      week: { columns: { number: true, startsOn: true, endsOn: true } },
      author: { columns: { name: true } },
      submissions: {
        with: {
          student: { columns: { id: true, firstName: true, lastName: true } },
          files: true,
        },
      },
    },
  });
}

export async function submitWork(assignmentId: string, studentId: string) {
  const db = getDb();
  await db
    .insert(schema.submissions)
    .values({
      assignmentId,
      studentId,
      state: "submitted",
      submittedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.submissions.assignmentId, schema.submissions.studentId],
      set: {
        state: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function gradeSubmission(
  submissionId: string,
  values: { score: number; feedback: string | null; gradedById: string },
) {
  await getDb()
    .update(schema.submissions)
    .set({
      score: values.score,
      feedback: values.feedback,
      gradedById: values.gradedById,
      gradedAt: new Date(),
      state: "returned",
      updatedAt: new Date(),
    })
    .where(eq(schema.submissions.id, submissionId));
}

/** Submissions handed in but not yet returned, for the teacher's queue. */
export async function gradingQueue(classIds: string[]) {
  if (classIds.length === 0) {
    return [];
  }
  return getDb().query.submissions.findMany({
    where: {
      state: "submitted",
      assignment: { classId: { in: classIds } },
    },
    with: {
      student: { columns: { id: true, firstName: true, lastName: true } },
      assignment: {
        columns: { id: true, title: true, dueDate: true, maxScore: true },
        with: {
          subject: { columns: { name: true, icon: true } },
          class: { columns: { name: true } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  /** Whole percent of recorded days marked present. `null` when nothing is recorded. */
  rate: number | null;
}

export async function attendanceSummary(
  studentId: string,
): Promise<AttendanceSummary> {
  const rows = await getDb()
    .select({ status: schema.attendance.status, n: count() })
    .from(schema.attendance)
    .where(eq(schema.attendance.studentId, studentId))
    .groupBy(schema.attendance.status);

  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    total: 0,
    rate: null,
  };
  for (const row of rows) {
    summary[row.status] = row.n;
    summary.total += row.n;
  }
  if (summary.total > 0) {
    summary.rate = Math.round((summary.present / summary.total) * 100);
  }
  return summary;
}

export async function attendanceForStudent(studentId: string, limit = 90) {
  return getDb().query.attendance.findMany({
    where: { studentId },
    orderBy: { date: "desc" },
    limit,
  });
}

export async function attendanceForClassOn(classId: string, date: string) {
  return getDb().query.attendance.findMany({
    where: { classId, date },
    with: {
      student: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function recordAttendance(
  entries: {
    studentId: string;
    classId: string;
    date: string;
    status: (typeof schema.attendanceStatusEnum.enumValues)[number];
    note?: string | null;
  }[],
  recordedById: string,
) {
  if (entries.length === 0) {
    return;
  }
  await getDb()
    .insert(schema.attendance)
    .values(entries.map((entry) => ({ ...entry, recordedById })))
    .onConflictDoUpdate({
      target: [schema.attendance.studentId, schema.attendance.date],
      set: {
        status: sql`excluded.status`,
        note: sql`excluded.note`,
        recordedById: sql`excluded.recorded_by_id`,
        updatedAt: new Date(),
      },
    });
}

export async function gradesForStudent(studentId: string) {
  return getDb().query.grades.findMany({
    where: { studentId },
    with: {
      subject: {
        columns: { name: true, nameAr: true, slug: true, icon: true },
      },
      term: { columns: { name: true } },
      teacher: { columns: { name: true } },
    },
    orderBy: { score: "desc" },
  });
}

/** Mean percentage across graded subjects, or `null` when there are none. */
export async function gradeAverage(studentId: string): Promise<number | null> {
  const [row] = await getDb()
    .select({
      avg: sql<
        number | null
      >`avg(${schema.grades.score}::numeric / ${schema.grades.maxScore} * 100)`,
    })
    .from(schema.grades)
    .where(eq(schema.grades.studentId, studentId));
  return row?.avg == null ? null : Math.round(row.avg);
}

export async function timetableForClass(classId: string) {
  return getDb().query.timetableSlots.findMany({
    where: { classId },
    with: {
      subject: {
        columns: { name: true, nameAr: true, slug: true, icon: true },
      },
      teacher: { columns: { name: true } },
    },
    orderBy: { weekday: "asc", startTime: "asc" },
  });
}

export async function timetableForTeacher(teacherId: string) {
  return getDb().query.timetableSlots.findMany({
    where: { teacherId },
    with: {
      subject: {
        columns: { name: true, nameAr: true, slug: true, icon: true },
      },
      class: { columns: { name: true } },
    },
    orderBy: { weekday: "asc", startTime: "asc" },
  });
}

/** Counts for one student, used by every role's overview card. */
export async function workloadFor(studentId: string, today = TODAY) {
  const db = getDb();

  const enrolment = await db.query.enrolments.findFirst({
    where: { studentId },
    columns: { classId: true },
  });
  if (!enrolment) {
    return { dueThisWeek: 0, overdue: 0, nextDue: null };
  }

  const [dueSoon] = await db
    .select({ n: count() })
    .from(schema.assignments)
    .leftJoin(
      schema.submissions,
      and(
        eq(schema.submissions.assignmentId, schema.assignments.id),
        eq(schema.submissions.studentId, studentId),
      ),
    )
    .where(
      and(
        eq(schema.assignments.classId, enrolment.classId),
        gte(schema.assignments.dueDate, today),
        lte(schema.assignments.dueDate, addDays(today, 7)),
        inArray(sql`coalesce(${schema.submissions.state}, 'not_started')`, [
          "not_started",
          "draft",
        ]),
      ),
    );

  const [overdue] = await db
    .select({ n: count() })
    .from(schema.assignments)
    .leftJoin(
      schema.submissions,
      and(
        eq(schema.submissions.assignmentId, schema.assignments.id),
        eq(schema.submissions.studentId, studentId),
      ),
    )
    .where(
      and(
        eq(schema.assignments.classId, enrolment.classId),
        lte(schema.assignments.dueDate, today),
        inArray(sql`coalesce(${schema.submissions.state}, 'not_started')`, [
          "not_started",
          "draft",
        ]),
      ),
    );

  const nextDue = await db.query.assignments.findFirst({
    where: { classId: enrolment.classId, dueDate: { gte: today } },
    with: { subject: { columns: { name: true, icon: true } } },
    orderBy: { dueDate: "asc" },
  });

  return {
    dueThisWeek: dueSoon?.n ?? 0,
    overdue: overdue?.n ?? 0,
    nextDue: nextDue ?? null,
  };
}
