import type { AssessmentScope } from "@faridalms/domain/academic-access";
import type { ClassDirectoryQuery } from "@faridalms/domain/school-schema";

import { canAssessOffering } from "@faridalms/domain/academic-access";
import { and, count, eq, ilike, or, sql } from "drizzle-orm";

import type { Database } from "../index";

import { schema } from "../index";

export async function listClasses(
  db: Database,
  ids: string[],
  authoringScope: AssessmentScope,
) {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.query.classes.findMany({
    where: { id: { in: ids } },
    with: {
      homeroomTeacher: { columns: { id: true, name: true } },
      schoolYear: { columns: { name: true } },
      enrolments: {
        where: { until: { isNull: true } },
        columns: { studentId: true },
      },
      classSubjects: {
        columns: { teacherId: true },
        with: {
          subject: {
            columns: { id: true, name: true, slug: true, icon: true },
          },
        },
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
    authoringSubjects: row.classSubjects.flatMap((link) =>
      link.subject && canAssessOffering(authoringScope, link.teacherId)
        ? [link.subject]
        : [],
    ),
  }));
}

export async function getClassDetail(db: Database, id: string, date: string) {
  const row = await db.query.classes.findFirst({
    where: { id },
    with: {
      homeroomTeacher: { columns: { id: true, name: true, email: true } },
      schoolYear: {
        columns: {
          id: true,
          name: true,
          startsOn: true,
          endsOn: true,
          status: true,
          isCurrent: true,
        },
      },
      classSubjects: {
        columns: {},
        with: {
          subject: {
            columns: { id: true, name: true, slug: true, icon: true },
          },
          teacher: { columns: { id: true, name: true } },
        },
      },
      enrolments: {
        where: {
          since: { lte: date },
          OR: [{ until: { isNull: true } }, { until: { gt: date } }],
        },
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
    schoolYearId: row.schoolYear?.id ?? null,
    schoolYearStatus: row.schoolYear?.status ?? null,
    schoolYearIsCurrent: row.schoolYear?.isCurrent ?? false,
    yearStartsOn: row.schoolYear?.startsOn ?? null,
    yearEndsOn: row.schoolYear?.endsOn ?? null,
    homeroomTeacher: row.homeroomTeacher,
    subjects: row.classSubjects,
    roster: row.enrolments
      .flatMap((link) => (link.student ? [link.student] : []))
      .toSorted((a, b) => a.firstName.localeCompare(b.firstName)),
  };
}

export async function listSubjects(db: Database) {
  return db.query.subjects.findMany({ orderBy: { name: "asc" } });
}

export interface SchoolStats {
  students: number;
  classes: number;
  teachers: number;
  assignments: number;
  unreadAcrossSchool: number;
}

export async function schoolStats(db: Database): Promise<SchoolStats> {
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
export async function schoolAttendanceRate(
  db: Database,
): Promise<number | null> {
  const rows = await db
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

export async function classDirectory(
  db: Database,
  query: ClassDirectoryQuery,
  schoolYearId: string,
) {
  const needle = `%${query.q.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    eq(schema.classes.schoolYearId, schoolYearId),
    query.q
      ? or(
          ilike(schema.classes.name, needle),
          ilike(schema.classes.grade, needle),
        )
      : undefined,
  );
  const [totals] = await db
    .select({ total: count() })
    .from(schema.classes)
    .where(filter);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pages);
  const column = {
    name: schema.classes.name,
    grade: schema.classes.grade,
    room: schema.classes.room,
  }[query.sort];
  const order =
    query.dir === "asc"
      ? sql`${column} asc nulls last`
      : sql`${column} desc nulls last`;
  const ids = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(filter)
    .orderBy(order, schema.classes.id)
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);
  const rows = await listClasses(
    db,
    ids.map((row) => row.id),
    { kind: "none" },
  );
  const orderById = new Map(ids.map((row, index) => [row.id, index]));
  rows.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
  return { rows, total, page, pages };
}
