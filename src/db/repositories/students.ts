import { and, inArray, isNull } from "drizzle-orm";

import { getDb, schema } from "~/db";
import { ageOn } from "~/utils/school";

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

const SUMMARY_WITH = {
  enrolments: {
    columns: {},
    with: {
      class: {
        columns: { id: true, name: true, grade: true },
        with: { homeroomTeacher: { columns: { name: true } } },
      },
    },
  },
} as const;

export async function listStudents(ids: string[]): Promise<StudentSummary[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await getDb().query.students.findMany({
    where: { id: { in: ids } },
    with: SUMMARY_WITH,
    orderBy: { firstName: "asc" },
  });
  return rows.map(toSummary);
}

export async function getStudentSummary(
  id: string,
): Promise<StudentSummary | undefined> {
  const row = await getDb().query.students.findFirst({
    where: { id },
    with: SUMMARY_WITH,
  });
  return row ? toSummary(row) : undefined;
}

export async function getStudentProfile(id: string) {
  const row = await getDb().query.students.findFirst({
    where: { id },
    with: {
      ...SUMMARY_WITH,
      contact: true,
      medical: true,
      emergencyContacts: { orderBy: { priority: "asc" } },
      medicalReports: { orderBy: { uploadedOn: "desc" } },
      guardianships: {
        with: { guardian: { columns: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!row) {
    return undefined;
  }

  return {
    ...toSummary(row),
    contact: row.contact ?? null,
    medical: row.medical ?? null,
    emergencyContacts: row.emergencyContacts,
    medicalReports: row.medicalReports,
    guardians: row.guardianships.map((link) => ({
      ...link.guardian,
      relation: link.relation,
      isPrimary: link.isPrimary,
    })),
  };
}

export type StudentProfile = NonNullable<
  Awaited<ReturnType<typeof getStudentProfile>>
>;

export async function listStaff() {
  return getDb().query.users.findMany({
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

export async function listAllUsers() {
  return getDb().query.users.findMany({
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
  studentId: string,
  values: Partial<typeof schema.studentMedical.$inferInsert>,
) {
  const db = getDb();
  await db
    .insert(schema.studentMedical)
    .values({ studentId, ...values })
    .onConflictDoUpdate({
      target: schema.studentMedical.studentId,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function setStudentContact(
  studentId: string,
  values: Partial<typeof schema.studentContacts.$inferInsert>,
) {
  const db = getDb();
  await db
    .insert(schema.studentContacts)
    .values({ studentId, ...values })
    .onConflictDoUpdate({
      target: schema.studentContacts.studentId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** Student ids enrolled in any of the given classes. */
export async function rosterFor(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) {
    return [];
  }
  const rows = await getDb()
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
