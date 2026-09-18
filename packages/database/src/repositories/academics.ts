import type { AssessmentScope } from "@faridalms/domain/academic-access";
import type { RecordAttendanceInput } from "@faridalms/domain/school-schema";

import { assignmentWindow, learnerState } from "@faridalms/domain/assignment";
import { addDays, schoolDate, weekForDate } from "@faridalms/domain/school";
import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";
import { ACADEMIC_STRUCTURE_LOCK } from "../locks";
import { ManagementError } from "./management";

export { addDays };

export function assessmentFilter(
  table: typeof schema.assignments,
  scope: AssessmentScope,
) {
  if (scope.kind === "school") return sql<boolean>`true`;
  if (scope.kind === "none") return sql<boolean>`false`;
  return sql<boolean>`exists (
    select 1 from ${schema.classSubjects}
    where ${schema.classSubjects.classId} = ${table.classId}
      and ${schema.classSubjects.subjectId} = ${table.subjectId}
      and ${schema.classSubjects.teacherId} = ${scope.userId}
  )`;
}

/**
 * Whether an assignment reaches a student: either they were recorded as a
 * recipient, or the audience is the whole class and they are enrolled today.
 */
export function audienceIncludes(
  table: typeof schema.assignments,
  studentId: string,
  today: string,
) {
  return sql<boolean>`(exists (select 1 from ${schema.assignmentRecipients} r
      where r.assignment_id = ${table.id} and r.student_id = ${studentId})
    or (${table.audience} = 'class' and exists (select 1 from ${schema.enrolments} e
      where e.class_id = ${table.classId} and e.student_id = ${studentId}
        and e.since <= ${today} and (e.until is null or e.until > ${today}))))`;
}

export async function currentSchoolYear(db: Database) {
  const row = await db.query.schoolYears.findFirst({
    where: { isCurrent: true },
  });
  if (!row) {
    throw new Error("No school year is marked current");
  }
  return row;
}

export async function listWeeks(
  db: Database | DatabaseTransaction,
  schoolYearId: string,
) {
  return db.query.academicWeeks.findMany({
    where: { schoolYearId },
    orderBy: { number: "asc" },
  });
}

/** The requested week when it exists, else the week `today` belongs to. */
export async function resolveWeek(
  db: Database,
  schoolYearId: string,
  requested: number | undefined,
  today = schoolDate("Africa/Cairo"),
) {
  const weeks = await listWeeks(db, schoolYearId);
  if (requested !== undefined) {
    const match = weeks.find((week) => week.number === requested);
    if (match) {
      return { week: match, weeks };
    }
  }
  const week = weekForDate(weeks, today);
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
  status: (typeof schema.assignmentStatusEnum.enumValues)[number];
  assignedOn: string;
  dueDate: string;
  dueAt: Date;
  availableFrom: Date | null;
  closesAt: Date | null;
  latePolicy: (typeof schema.latePolicyEnum.enumValues)[number];
  submissionFormat: (typeof schema.submissionFormatEnum.enumValues)[number];
  window: ReturnType<typeof assignmentWindow>;
  learnerState: ReturnType<typeof learnerState>;
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
    content: string | null;
  } | null;
}

/**
 * Assignments for one student, with that student's own submission attached.
 *
 * Scoped by student rather than by class so the caller never has to filter a
 * whole class's submissions client-side.
 */
export async function assignmentsForStudent(
  db: Database,
  studentId: string,
  options: {
    weekId?: string;
    classId?: string;
    today: string;
    schoolYearId: string;
    now?: Date;
  },
): Promise<AssignmentRow[]> {
  const enrolment = await db.query.enrolments.findFirst({
    where: {
      studentId,
      class: { schoolYearId: options.schoolYearId },
      since: { lte: options.today },
      OR: [{ until: { isNull: true } }, { until: { gt: options.today } }],
    },
    columns: { classId: true },
  });
  const classId = options.classId ?? enrolment?.classId;
  if (!classId) {
    return [];
  }

  const now = options.now ?? new Date();
  const rows = await db.query.assignments.findMany({
    where: {
      classId,
      status: { ne: "draft" },
      RAW: (table) => audienceIncludes(table, studentId, options.today),
      class: { schoolYearId: options.schoolYearId },
      ...(options.weekId ? { weekId: options.weekId } : {}),
    },
    with: {
      subject: true,
      week: { columns: { number: true } },
      class: { columns: { id: true, name: true } },
      author: { columns: { name: true } },
      submissions: {
        where: { studentId },
        extras: {
          attemptCount: (table) =>
            sql<number>`(select count(*) from ${schema.submissionAttempts} a where a.submission_id = ${table.id})::int`,
        },
      },
    },
    orderBy: { dueAt: "asc" },
  });

  return rows.flatMap((row) => {
    // `subject` and `class` are required foreign keys, but the relational
    // builder types every joined row as nullable. Skipping rather than
    // asserting means a future nullable FK degrades instead of throwing.
    if (!row.subject || !row.class) {
      return [];
    }
    const submission = row.submissions[0];
    const window =
      row.status === "archived" ? "closed" : assignmentWindow(row, now);
    return [
      {
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        assignedOn: row.assignedOn,
        dueDate: row.dueDate,
        dueAt: row.dueAt,
        availableFrom: row.availableFrom,
        closesAt: row.closesAt,
        latePolicy: row.latePolicy,
        submissionFormat: row.submissionFormat,
        window,
        learnerState: learnerState({
          window,
          hasDraft: Boolean(submission?.draft),
          attempts: submission?.attemptCount ?? 0,
          released: submission?.state === "returned",
        }),
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
              content: submission.content,
            }
          : null,
      },
    ];
  });
}

export async function assignmentsForClasses(
  db: Database,
  classIds: string[],
  scope: AssessmentScope,
  weekId?: string,
  status?: "draft" | "published" | "archived",
) {
  if (classIds.length === 0) {
    return [];
  }
  return db.query.assignments.findMany({
    extras: {
      canAssess: (table) => assessmentFilter(table, scope),
      recipientCount: (table) =>
        sql<number>`(select count(*) from ${schema.assignmentRecipients} r where r.assignment_id = ${table.id})::int`,
      submittedCount: (table) =>
        sql<number>`(select count(*) from ${schema.submissions} s where s.assignment_id = ${table.id} and s.current_attempt_id is not null)::int`,
      releasedCount: (table) =>
        sql<number>`(select count(*) from ${schema.submissions} s where s.assignment_id = ${table.id} and s.state = 'returned')::int`,
    },
    where: {
      classId: { in: classIds },
      ...(weekId ? { weekId } : {}),
      ...(status ? { status } : {}),
      OR: [
        { status: { ne: "draft" } },
        { RAW: (table) => assessmentFilter(table, scope) },
      ],
    },
    with: {
      subject: { columns: { name: true, slug: true, icon: true } },
      class: { columns: { id: true, name: true } },
      week: { columns: { number: true } },
      submissions: {
        where: {
          assignment: { RAW: (table) => assessmentFilter(table, scope) },
        },
        columns: { id: true, state: true, score: true },
        with: {
          student: { columns: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { dueAt: "asc" },
  });
}

export async function getAssignment(
  db: Database,
  id: string,
  scope: AssessmentScope,
  studentIds: string[],
) {
  return db.query.assignments.findFirst({
    where: { id },
    with: {
      subject: true,
      class: { columns: { id: true, name: true } },
      week: { columns: { number: true, startsOn: true, endsOn: true } },
      author: { columns: { name: true } },
      resources: { with: { file: true }, orderBy: { position: "asc" } },
      submissions: {
        where: {
          OR: [
            { assignment: { RAW: (table) => assessmentFilter(table, scope) } },
            { studentId: { in: studentIds } },
          ],
        },
        with: {
          student: { columns: { id: true, firstName: true, lastName: true } },
          attempts: {
            columns: {
              id: true,
              number: true,
              submittedAt: true,
              isLate: true,
            },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  });
}

export async function submitWork(
  db: Database,
  assignmentId: string,
  studentId: string,
  content: string,
) {
  const rows = await db
    .insert(schema.submissions)
    .values({
      assignmentId,
      studentId,
      content,
      state: "submitted",
      submittedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.submissions.assignmentId, schema.submissions.studentId],
      set: {
        content,
        state: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      },
      setWhere: inArray(schema.submissions.state, ["not_started", "draft"]),
    })
    .returning({ id: schema.submissions.id });
  return rows.length > 0;
}

export async function gradeSubmission(
  db: Database,
  submissionId: string,
  values: { score: number; feedback: string | null; gradedById: string },
  scope: AssessmentScope,
) {
  const rows = await db
    .update(schema.submissions)
    .set({
      score: values.score,
      feedback: values.feedback,
      gradedById: values.gradedById,
      gradedAt: new Date(),
      state: "returned",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.submissions.id, submissionId),
        sql`exists (select 1 from ${schema.assignments}
        where ${schema.assignments.id} = ${schema.submissions.assignmentId}
          and ${assessmentFilter(schema.assignments, scope)})`,
      ),
    )
    .returning({ id: schema.submissions.id });
  return rows.length > 0;
}

/** Submissions handed in but not yet returned, for the teacher's queue. */
export async function gradingQueue(
  db: Database,
  classIds: string[],
  scope: AssessmentScope,
) {
  if (classIds.length === 0) {
    return [];
  }
  return db.query.submissions.findMany({
    where: {
      state: "submitted",
      assignment: {
        classId: { in: classIds },
        RAW: (table) => assessmentFilter(table, scope),
      },
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
  db: Database,
  studentId: string,
): Promise<AttendanceSummary> {
  const rows = await db
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

/** One summary per student, for a class roster in a single round trip. */
export async function attendanceSummaries(
  db: Database,
  studentIds: string[],
): Promise<Map<string, AttendanceSummary>> {
  const summaries = new Map<string, AttendanceSummary>();
  if (studentIds.length === 0) return summaries;
  const rows = await db
    .select({
      studentId: schema.attendance.studentId,
      status: schema.attendance.status,
      n: count(),
    })
    .from(schema.attendance)
    .where(inArray(schema.attendance.studentId, studentIds))
    .groupBy(schema.attendance.studentId, schema.attendance.status);
  for (const row of rows) {
    const summary = summaries.get(row.studentId) ?? {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total: 0,
      rate: null,
    };
    summary[row.status] = row.n;
    summary.total += row.n;
    summary.rate = Math.round((summary.present / summary.total) * 100);
    summaries.set(row.studentId, summary);
  }
  return summaries;
}

export async function attendanceForStudent(
  db: Database,
  studentId: string,
  limit = 90,
) {
  return db.query.attendance.findMany({
    where: { studentId },
    orderBy: { date: "desc" },
    limit,
  });
}

export async function attendanceForClassOn(
  db: Database,
  classId: string,
  date: string,
) {
  return db.query.attendance.findMany({
    where: { classId, date },
    with: {
      student: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function recordAttendance(
  db: Database,
  input: RecordAttendanceInput,
  recordedById: string,
  scope: AssessmentScope,
  today: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    const schoolClass = await tx.query.classes.findFirst({
      where: { id: input.classId },
      with: {
        schoolYear: true,
        classSubjects: { columns: { teacherId: true } },
      },
    });
    if (!schoolClass?.schoolYear)
      throw new ManagementError("NOT_FOUND", "attendance.class_missing");
    if (
      scope.kind === "none" ||
      (scope.kind === "teacher" &&
        (!schoolClass.schoolYear.isCurrent ||
          (schoolClass.homeroomTeacherId !== scope.userId &&
            !schoolClass.classSubjects.some(
              (subject) => subject.teacherId === scope.userId,
            ))))
    )
      throw new ManagementError(
        "FORBIDDEN",
        "attendance.responsibility_changed",
      );
    if (
      input.date < schoolClass.schoolYear.startsOn ||
      input.date > schoolClass.schoolYear.endsOn
    ) {
      throw new ManagementError("BAD_REQUEST", "attendance.outside_year");
    }
    if (input.date > today)
      throw new ManagementError("BAD_REQUEST", "attendance.future_date");
    const enrollment = await tx.query.enrolments.findMany({
      where: {
        classId: input.classId,
        since: { lte: input.date },
        OR: [{ until: { isNull: true } }, { until: { gt: input.date } }],
      },
      columns: { studentId: true },
    });
    const students = new Set(enrollment.map((row) => row.studentId));
    if (input.entries.some((entry) => !students.has(entry.studentId)))
      throw new ManagementError("FORBIDDEN", "attendance.roster_changed");
    if (input.entries.length === 0) return [];
    const existing = await tx
      .select()
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.date, input.date),
          inArray(
            schema.attendance.studentId,
            input.entries.map((entry) => entry.studentId),
          ),
        ),
      )
      .orderBy(schema.attendance.studentId)
      .for("update");
    const byStudent = new Map(existing.map((row) => [row.studentId, row]));
    for (const entry of input.entries) {
      const current = byStudent.get(entry.studentId);
      if (current && current.classId !== input.classId)
        throw new ManagementError("CONFLICT", "attendance.class_conflict");
      if ((current?.revision ?? null) !== (entry.expectedRevision ?? null))
        throw new ManagementError("CONFLICT", "attendance.revision_conflict");
    }
    const saved = await tx
      .insert(schema.attendance)
      .values(
        input.entries
          .toSorted((a, b) => a.studentId.localeCompare(b.studentId))
          .map((entry) => ({
            studentId: entry.studentId,
            classId: input.classId,
            date: input.date,
            status: entry.status,
            revision: (entry.expectedRevision ?? 0) + 1,
            note: entry.note || null,
            recordedById,
          })),
      )
      .onConflictDoUpdate({
        target: [schema.attendance.studentId, schema.attendance.date],
        set: {
          status: sql`excluded.status`,
          revision: sql`excluded.revision`,
          note: sql`excluded.note`,
          recordedById: sql`excluded.recorded_by_id`,
          updatedAt: new Date(),
        },
        setWhere: sql`${schema.attendance.classId} = excluded.class_id and ${schema.attendance.revision} = excluded.revision - 1`,
      })
      .returning({
        studentId: schema.attendance.studentId,
        revision: schema.attendance.revision,
      });
    if (saved.length !== input.entries.length)
      throw new ManagementError("CONFLICT", "attendance.revision_conflict");
    return saved;
  });
}

export async function gradesForStudent(db: Database, studentId: string) {
  return db.query.grades.findMany({
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
export async function gradeAverage(
  db: Database,
  studentId: string,
): Promise<number | null> {
  const [row] = await db
    .select({
      avg: sql<
        number | null
      >`avg(${schema.grades.score}::numeric / ${schema.grades.maxScore} * 100)`,
    })
    .from(schema.grades)
    .where(eq(schema.grades.studentId, studentId));
  return row?.avg == null ? null : Math.round(row.avg);
}

export async function timetableForClass(db: Database, classId: string) {
  return db.query.timetableSlots.findMany({
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

export async function timetableForTeacher(db: Database, teacherId: string) {
  return db.query.timetableSlots.findMany({
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

function recipientOf(studentId: string, today: string) {
  return audienceIncludes(schema.assignments, studentId, today);
}

/** Counts for one student, used by every role's overview card. */
export async function workloadFor(
  db: Database,
  studentId: string,
  today: string,
  schoolYearId: string,
) {
  const enrolment = await db.query.enrolments.findFirst({
    where: {
      studentId,
      class: { schoolYearId },
      since: { lte: today },
      OR: [{ until: { isNull: true } }, { until: { gt: today } }],
    },
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
        eq(schema.assignments.status, "published"),
        recipientOf(studentId, today),
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
        eq(schema.assignments.status, "published"),
        recipientOf(studentId, today),
        lte(schema.assignments.dueDate, today),
        inArray(sql`coalesce(${schema.submissions.state}, 'not_started')`, [
          "not_started",
          "draft",
        ]),
      ),
    );

  const nextDue = await db.query.assignments.findFirst({
    where: {
      classId: enrolment.classId,
      status: "published",
      RAW: (table) => audienceIncludes(table, studentId, today),
      dueDate: { gte: today },
    },
    with: { subject: { columns: { name: true, icon: true } } },
    orderBy: { dueDate: "asc" },
  });

  return {
    dueThisWeek: dueSoon?.n ?? 0,
    overdue: overdue?.n ?? 0,
    nextDue: nextDue ?? null,
  };
}
