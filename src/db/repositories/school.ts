import { count, eq } from "drizzle-orm";

import { getDb, schema } from "~/db";

export async function listClasses(ids?: string[]) {
  if (ids && ids.length === 0) {
    return [];
  }
  const rows = await getDb().query.classes.findMany({
    ...(ids ? { where: { id: { in: ids } } } : {}),
    with: {
      homeroomTeacher: { columns: { id: true, name: true } },
      schoolYear: { columns: { name: true } },
      enrolments: { columns: { studentId: true } },
      classSubjects: {
        columns: {},
        with: { subject: { columns: { name: true, slug: true, icon: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    grade: row.grade,
    stage: row.stage,
    room: row.room,
    schoolYear: row.schoolYear?.name ?? null,
    homeroomTeacher: row.homeroomTeacher,
    enrolledCount: row.enrolments.length,
    subjects: row.classSubjects.map((link) => link.subject),
  }));
}

export async function getClassDetail(id: string) {
  const row = await getDb().query.classes.findFirst({
    where: { id },
    with: {
      homeroomTeacher: { columns: { id: true, name: true, email: true } },
      schoolYear: { columns: { name: true } },
      classSubjects: {
        columns: {},
        with: {
          subject: {
            columns: { id: true, name: true, slug: true, icon: true },
          },
          teacher: { columns: { name: true } },
        },
      },
      enrolments: {
        with: {
          student: {
            columns: {
              id: true,
              reference: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    stage: row.stage,
    room: row.room,
    schoolYear: row.schoolYear?.name ?? null,
    homeroomTeacher: row.homeroomTeacher,
    subjects: row.classSubjects,
    roster: row.enrolments
      .flatMap((link) => (link.student ? [link.student] : []))
      .toSorted((a, b) => a.firstName.localeCompare(b.firstName)),
  };
}

export async function listSubjects() {
  return getDb().query.subjects.findMany({ orderBy: { name: "asc" } });
}

export interface SchoolStats {
  students: number;
  classes: number;
  teachers: number;
  assignments: number;
  unreadAcrossSchool: number;
}

export async function schoolStats(): Promise<SchoolStats> {
  const db = getDb();
  const [[students], [classes], [teachers], [assignments]] = await Promise.all([
    db.select({ n: count() }).from(schema.students),
    db.select({ n: count() }).from(schema.classes),
    db
      .select({ n: count() })
      .from(schema.users)
      .where(eq(schema.users.role, "teacher")),
    db.select({ n: count() }).from(schema.assignments),
  ]);

  return {
    students: students?.n ?? 0,
    classes: classes?.n ?? 0,
    teachers: teachers?.n ?? 0,
    assignments: assignments?.n ?? 0,
    unreadAcrossSchool: 0,
  };
}

/** Attendance rate across the whole school, for the admin overview. */
export async function schoolAttendanceRate(): Promise<number | null> {
  const rows = await getDb()
    .select({ status: schema.attendance.status, n: count() })
    .from(schema.attendance)
    .groupBy(schema.attendance.status);

  const total = rows.reduce((sum, row) => sum + row.n, 0);
  if (total === 0) {
    return null;
  }
  const present = rows.find((row) => row.status === "present")?.n ?? 0;
  return Math.round((present / total) * 100);
}
