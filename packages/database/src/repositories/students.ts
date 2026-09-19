import type {
  StaffDirectoryQuery,
  StudentDirectoryQuery,
} from "@faridalms/domain/school-schema";

import { ageOn } from "@faridalms/domain/school";
import {
  and,
  count,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type { Database } from "../index";

import { schema } from "../index";

export { ageOn };

export interface StudentSummary {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthdate: string | null;
  photoUrl: string | null;
  className: string | null;
  grade: string | null;
  classId: string | null;
  homeroomTeacher: string | null;
}

interface SummarySource {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  birthdate: string | null;
  photoUrl: string | null;
  enrolments: {
    class: {
      id: string;
      name: string;
      grade: string;
      homeroomTeacher: { name: string } | null;
    } | null;
  }[];
}

function toSummary(row: SummarySource): StudentSummary {
  const current = row.enrolments[0]?.class ?? null;
  return {
    id: row.id,
    reference: row.reference,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`,
    birthdate: row.birthdate,
    photoUrl: row.photoUrl,
    className: current?.name ?? null,
    grade: current?.grade ?? null,
    classId: current?.id ?? null,
    homeroomTeacher: current?.homeroomTeacher?.name ?? null,
  };
}

interface EnrollmentContext {
  schoolYearId: string;
  today: string;
}

function summaryWith(scope: EnrollmentContext) {
  return {
    enrolments: {
      where: {
        since: { lte: scope.today },
        RAW: (table: typeof schema.enrolments) =>
          sql`(${table.until} is null or ${table.until} > ${scope.today})`,
        class: { schoolYearId: scope.schoolYearId },
      },
      columns: {},
      with: {
        class: {
          columns: { id: true, name: true, grade: true },
          with: { homeroomTeacher: { columns: { name: true } } },
        },
      },
    },
  } as const;
}

export async function listStudents(
  db: Database,
  ids: string[],
  scope: EnrollmentContext,
): Promise<StudentSummary[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.query.students.findMany({
    where: { id: { in: ids } },
    with: summaryWith(scope),
    orderBy: { firstName: "asc" },
  });
  return rows.map(toSummary);
}

export async function getStudentSummary(
  db: Database,
  id: string,
  scope: EnrollmentContext,
): Promise<StudentSummary | undefined> {
  const row = await db.query.students.findFirst({
    where: { id },
    with: summaryWith(scope),
  });
  return row ? toSummary(row) : undefined;
}

export async function getStudentProfile(
  db: Database,
  id: string,
  access: {
    contacts: boolean;
    medical: boolean;
    historyClassIds: string[] | null;
    visibleClassIds: string[];
  },
  scope: EnrollmentContext,
) {
  const row = await db.query.students.findFirst({
    where: { id },
    with: {
      ...summaryWith(scope),
      contact: access.contacts,
      medical: access.medical,
      emergencyContacts: access.contacts
        ? { orderBy: { priority: "asc" } }
        : undefined,
      medicalReports: access.medical
        ? { orderBy: { uploadedOn: "desc" } }
        : undefined,
      guardianships: access.contacts
        ? {
            with: {
              guardian: { columns: { id: true, name: true, email: true } },
            },
          }
        : undefined,
    },
  });

  if (!row) {
    return undefined;
  }

  const enrollments = await db.query.enrolments.findMany({
    where: {
      studentId: id,
      ...(access.historyClassIds
        ? { classId: { in: access.historyClassIds } }
        : {}),
    },
    orderBy: { since: "desc", createdAt: "desc", id: "asc" },
    with: {
      class: {
        columns: { id: true, name: true },
        with: { schoolYear: { columns: { id: true, name: true } } },
      },
    },
  });

  return {
    ...toSummary(row),
    enrollmentHistory: enrollments.map((enrollment) => ({
      id: enrollment.id,
      since: enrollment.since,
      until: enrollment.until,
      classId: enrollment.classId,
      className: enrollment.class?.name ?? null,
      schoolYear: enrollment.class?.schoolYear?.name ?? null,
      canOpenClass: access.visibleClassIds.includes(enrollment.classId),
    })),
    contact: row.contact ?? null,
    medical: row.medical ?? null,
    emergencyContacts: access.contacts ? row.emergencyContacts : [],
    medicalReports: access.medical ? row.medicalReports : [],
    guardians: (access.contacts ? row.guardianships : []).flatMap((link) =>
      "guardian" in link && link.guardian
        ? [
            {
              ...link.guardian,
              relation: link.relation,
              isPrimary: link.isPrimary,
            },
          ]
        : [],
    ),
  };
}

export type StudentProfile = NonNullable<
  Awaited<ReturnType<typeof getStudentProfile>>
>;

export async function listStaff(db: Database) {
  return db.query.users.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      isActive: true,
      lastSignedInAt: true,
    },
    where: { role: { in: ["admin", "teacher"] } },
    orderBy: { name: "asc" },
  });
}

export async function listAllUsers(db: Database) {
  return db.query.users.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      isActive: true,
      lastSignedInAt: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function setStudentMedical(
  db: Database,
  studentId: string,
  values: Partial<typeof schema.studentMedical.$inferInsert>,
) {
  await db
    .insert(schema.studentMedical)
    .values({ studentId, ...values })
    .onConflictDoUpdate({
      target: schema.studentMedical.studentId,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function setStudentContact(
  db: Database,
  studentId: string,
  values: Partial<typeof schema.studentContacts.$inferInsert>,
) {
  await db
    .insert(schema.studentContacts)
    .values({ studentId, ...values })
    .onConflictDoUpdate({
      target: schema.studentContacts.studentId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** Student ids enrolled in any of the given classes. */
export async function rosterFor(
  db: Database,
  classIds: string[],
): Promise<string[]> {
  if (classIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ studentId: schema.enrolments.studentId })
    .from(schema.enrolments)
    // `until` null means the enrolment is still live; a leaver keeps their row
    // so past attendance and grades still resolve.
    .where(
      and(
        inArray(schema.enrolments.classId, classIds),
        isNull(schema.enrolments.until),
      ),
    );
  return [...new Set(rows.map((row) => row.studentId))];
}

export async function studentDirectory(
  db: Database,
  query: StudentDirectoryQuery,
  placement: { schoolYearId: string; on: string },
) {
  const { students, enrolments, classes, users } = schema;
  const placed = and(
    eq(enrolments.studentId, students.id),
    lte(enrolments.since, placement.on),
    or(isNull(enrolments.until), gt(enrolments.until, placement.on)),
    sql`${enrolments.classId} in (select id from ${classes} where ${classes.schoolYearId} = ${placement.schoolYearId})`,
  );
  const name = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;
  const sortColumns = {
    name,
    reference: students.reference,
    grade: classes.grade,
    class: classes.name,
    homeroom: users.name,
  };
  const needle = `%${query.q.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const filter = query.q
    ? or(
        ilike(name, needle),
        ilike(students.reference, needle),
        ilike(classes.name, needle),
        ilike(classes.grade, needle),
        ilike(users.name, needle),
      )
    : undefined;
  const source = db
    .select({
      id: students.id,
      fullName: name,
      reference: students.reference,
      photoUrl: students.photoUrl,
      grade: classes.grade,
      className: classes.name,
      homeroomTeacher: users.name,
    })
    .from(students)
    .leftJoin(enrolments, placed)
    .leftJoin(classes, eq(enrolments.classId, classes.id))
    .leftJoin(users, eq(classes.homeroomTeacherId, users.id))
    .where(filter);
  const [totals] = await db
    .select({ total: count() })
    .from(students)
    .leftJoin(enrolments, placed)
    .leftJoin(classes, eq(enrolments.classId, classes.id))
    .leftJoin(users, eq(classes.homeroomTeacherId, users.id))
    .where(filter);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pages);
  const column = sortColumns[query.sort];
  const order =
    query.dir === "asc"
      ? sql`${column} asc nulls last`
      : sql`${column} desc nulls last`;
  const rows = await source
    .orderBy(order, students.id)
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);
  return { rows, total, page, pages };
}

export async function staffDirectory(db: Database, query: StaffDirectoryQuery) {
  const needle = `%${query.q.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    query.role === "all" ? undefined : eq(schema.users.role, query.role),
    query.status === "all"
      ? undefined
      : eq(schema.users.isActive, query.status === "active"),
    query.q
      ? or(ilike(schema.users.name, needle), ilike(schema.users.email, needle))
      : undefined,
  );
  const columns = {
    name: schema.users.name,
    email: schema.users.email,
    role: schema.users.role,
    status: schema.users.isActive,
  };
  const order =
    query.dir === "asc"
      ? sql`${columns[query.sort]} asc`
      : sql`${columns[query.sort]} desc`;
  const [totals] = await db
    .select({ total: count() })
    .from(schema.users)
    .where(filter);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pages);
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      title: schema.users.title,
      mobile: schema.users.mobile,
      isActive: schema.users.isActive,
      lastSignedInAt: schema.users.lastSignedInAt,
    })
    .from(schema.users)
    .where(filter)
    .orderBy(order, schema.users.id)
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);
  return { rows, total, page, pages };
}
