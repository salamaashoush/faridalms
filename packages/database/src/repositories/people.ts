import type { Database } from "../index";

import { listStudents } from "./students";

/**
 * What the viewer may reach. Admins see the whole school; everyone else sees
 * people through a class they belong to, a student they are related to, or a
 * conversation they took part in.
 */
export interface PersonScope {
  viewerId: string;
  school: boolean;
  classIds: string[];
  studentIds: string[];
}

export async function personReachable(
  db: Database,
  id: string,
  scope: PersonScope,
): Promise<boolean> {
  if (id === scope.viewerId || scope.school) return true;
  const target = await db.query.users.findFirst({
    where: { id, isActive: true },
    columns: { role: true },
  });
  if (!target) return false;
  if (target.role === "admin") return true;
  if (scope.classIds.length > 0) {
    const teaches = await db.query.classes.findFirst({
      where: {
        id: { in: scope.classIds },
        OR: [{ homeroomTeacherId: id }, { classSubjects: { teacherId: id } }],
      },
      columns: { id: true },
    });
    if (teaches) return true;
  }
  if (scope.studentIds.length > 0) {
    const related = await db.query.students.findFirst({
      where: {
        id: { in: scope.studentIds },
        OR: [{ userId: id }, { guardianships: { guardianId: id } }],
      },
      columns: { id: true },
    });
    if (related) return true;
  }
  const spoke = await db.query.messages.findFirst({
    where: {
      OR: [
        { senderId: id, recipients: { recipientId: scope.viewerId } },
        { senderId: scope.viewerId, recipients: { recipientId: id } },
      ],
    },
    columns: { id: true },
  });
  return spoke !== undefined;
}

export async function getPersonProfile(
  db: Database,
  id: string,
  scope: PersonScope,
  options: { contact: boolean; schoolYearId: string; today: string },
) {
  const row = await db.query.users.findFirst({
    where: { id },
    columns: {
      id: true,
      name: true,
      role: true,
      title: true,
      email: true,
      mobile: true,
      avatarUrl: true,
      isActive: true,
    },
    with: {
      homeroomClasses: {
        where: { schoolYearId: options.schoolYearId },
        columns: { id: true, name: true, grade: true },
        orderBy: { name: "asc" },
      },
      guardianships: {
        columns: { studentId: true, relation: true, isPrimary: true },
      },
      studentRecord: { columns: { id: true } },
    },
  });
  if (!row) return undefined;

  const taught = await db.query.classSubjects.findMany({
    where: { teacherId: id, class: { schoolYearId: options.schoolYearId } },
    columns: {},
    with: {
      class: { columns: { id: true, name: true, grade: true } },
      subject: { columns: { id: true, name: true, nameAr: true, icon: true } },
    },
  });

  const childIds = row.guardianships
    .map((link) => link.studentId)
    .filter(
      (studentId) => scope.school || scope.studentIds.includes(studentId),
    );
  const children = await listStudents(db, childIds, {
    schoolYearId: options.schoolYearId,
    today: options.today,
  });
  const relationOf = new Map(
    row.guardianships.map((link) => [link.studentId, link] as const),
  );

  const ownStudentId = row.studentRecord?.id ?? null;
  const [student] =
    ownStudentId && (scope.school || scope.studentIds.includes(ownStudentId))
      ? await listStudents(db, [ownStudentId], {
          schoolYearId: options.schoolYearId,
          today: options.today,
        })
      : [];

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    title: row.title,
    avatarUrl: row.avatarUrl,
    isActive: row.isActive,
    contact: options.contact ? { email: row.email, mobile: row.mobile } : null,
    teaching: [
      ...row.homeroomClasses.map((schoolClass) => ({
        classId: schoolClass.id,
        className: schoolClass.name,
        grade: schoolClass.grade,
        subject: null,
        canOpen: scope.school || scope.classIds.includes(schoolClass.id),
      })),
      ...taught.flatMap((link) =>
        link.class
          ? [
              {
                classId: link.class.id,
                className: link.class.name,
                grade: link.class.grade,
                subject: link.subject,
                canOpen: scope.school || scope.classIds.includes(link.class.id),
              },
            ]
          : [],
      ),
    ].toSorted(
      (a, b) =>
        a.className.localeCompare(b.className) ||
        (a.subject?.name ?? "").localeCompare(b.subject?.name ?? ""),
    ),
    children: children.map((child) => ({
      ...child,
      relation: relationOf.get(child.id)?.relation ?? "guardian",
      isPrimary: relationOf.get(child.id)?.isPrimary ?? false,
    })),
    student: student ?? null,
  };
}

export type PersonProfile = NonNullable<
  Awaited<ReturnType<typeof getPersonProfile>>
>;
