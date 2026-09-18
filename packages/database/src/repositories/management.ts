import type {
  SaveSubjectInput,
  PublishNewsletterInput,
  SaveUserInput,
  SaveStudentInput,
  SaveClassInput,
} from "@faridalms/domain/administration-schema";

import {
  and,
  eq,
  gt,
  ilike,
  isNull,
  ne,
  sql,
  inArray,
  notInArray,
  or,
} from "drizzle-orm";

import type { Database } from "../index";

import { ACADEMIC_STRUCTURE_LOCK } from "../locks";
import * as s from "../schema";

export class ManagementError extends Error {
  constructor(
    public readonly code:
      | "CONFLICT"
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

export async function saveUser(
  db: Database,
  input: SaveUserInput,
  actorId: string,
  passwordHash?: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741903)`);
    if (input.id === actorId && (!input.isActive || input.role !== "admin"))
      throw new ManagementError(
        "FORBIDDEN",
        "You cannot remove your own administrative access",
      );
    const duplicate = await tx.query.users.findFirst({
      where: {
        RAW: (table) =>
          sql`${and(sql`lower(${table.email}) = ${input.email.toLowerCase()}`, input.id ? ne(table.id, input.id) : undefined)}`,
      },
    });
    if (duplicate)
      throw new ManagementError(
        "CONFLICT",
        "An account already uses this email",
      );
    const values = {
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      title: input.title || null,
      mobile: input.mobile || null,
      isActive: input.isActive,
      updatedAt: new Date(),
    };
    if (input.id) {
      const existing = await tx.query.users.findFirst({
        where: { id: input.id },
      });
      if (!existing)
        throw new ManagementError("NOT_FOUND", "Account not found");
      if (existing.role !== input.role) {
        const [teaching, guardian, student] = await Promise.all([
          tx.query.classSubjects.findFirst({ where: { teacherId: input.id } }),
          tx.query.guardianships.findFirst({ where: { guardianId: input.id } }),
          tx.query.students.findFirst({ where: { userId: input.id } }),
        ]);
        const homeroom = await tx.query.classes.findFirst({
          where: { homeroomTeacherId: input.id },
        });
        if (teaching || guardian || student || homeroom)
          throw new ManagementError(
            "CONFLICT",
            "Reassign this account's school relationships before changing its role",
          );
      }
      await tx
        .update(s.users)
        .set({ ...values, ...(passwordHash ? { passwordHash } : {}) })
        .where(eq(s.users.id, input.id));
      return { id: input.id };
    }
    if (!passwordHash)
      throw new ManagementError("BAD_REQUEST", "A password is required");
    const [row] = await tx
      .insert(s.users)
      .values({ ...values, passwordHash })
      .returning({ id: s.users.id });
    if (!row) throw new Error("Account insert returned no row");
    return row;
  });
}

export async function saveStudent(
  db: Database,
  input: SaveStudentInput,
  schoolYearId: string,
  today: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    if (input.birthdate && input.birthdate > today)
      throw new ManagementError(
        "BAD_REQUEST",
        "Birthdate cannot be in the future",
      );
    if (
      input.classId &&
      !(await tx.query.classes.findFirst({
        where: { id: input.classId, schoolYearId },
      }))
    )
      throw new ManagementError(
        "BAD_REQUEST",
        "Choose a class in the current school year",
      );
    const guardianIds = [...new Set(input.guardianIds ?? [])];
    const parents = guardianIds.length
      ? await tx.query.users.findMany({
          where: { id: { in: guardianIds }, role: "parent" },
          columns: { id: true },
        })
      : [];
    if (parents.length !== guardianIds.length)
      throw new ManagementError(
        "BAD_REQUEST",
        "Choose parent accounts in this school",
      );
    if (
      input.userId &&
      !(await tx.query.users.findFirst({
        where: { id: input.userId, role: "student", isActive: true },
      }))
    )
      throw new ManagementError(
        "BAD_REQUEST",
        "Choose an active student account",
      );
    if (
      input.userId &&
      (await tx.query.students.findFirst({
        where: {
          RAW: (table) =>
            sql`${and(eq(table.userId, input.userId ?? ""), input.id ? ne(table.id, input.id) : undefined)}`,
        },
      }))
    )
      throw new ManagementError(
        "CONFLICT",
        "This account is linked to another student",
      );
    if (
      await tx.query.students.findFirst({
        where: {
          RAW: (table) =>
            sql`${and(eq(table.reference, input.reference), input.id ? ne(table.id, input.id) : undefined)}`,
        },
      })
    )
      throw new ManagementError(
        "CONFLICT",
        "A student already uses this reference",
      );
    const values = {
      reference: input.reference,
      firstName: input.firstName,
      lastName: input.lastName,
      birthdate: input.birthdate || null,
      userId: input.userId || null,
      updatedAt: new Date(),
    };
    const [student] = input.id
      ? await tx
          .update(s.students)
          .set(values)
          .where(eq(s.students.id, input.id))
          .returning({ id: s.students.id })
      : await tx
          .insert(s.students)
          .values(values)
          .returning({ id: s.students.id });
    if (!student) throw new ManagementError("NOT_FOUND", "Student not found");
    const scheduled = await tx.query.enrolments.findFirst({
      where: {
        studentId: student.id,
        since: { gt: today },
        class: { schoolYearId },
      },
    });
    if (scheduled)
      throw new ManagementError("CONFLICT", "enrollment.scheduled_conflict");
    await tx
      .update(s.enrolments)
      .set({ until: today, updatedAt: new Date() })
      .where(
        and(
          eq(s.enrolments.studentId, student.id),
          or(isNull(s.enrolments.until), gt(s.enrolments.until, today)),
          sql`${s.enrolments.classId} in (select ${s.classes.id} from ${s.classes} where ${s.classes.schoolYearId} = ${schoolYearId})`,
          input.classId ? ne(s.enrolments.classId, input.classId) : undefined,
        ),
      );
    const continuing = input.classId
      ? await tx.query.enrolments.findFirst({
          where: {
            studentId: student.id,
            classId: input.classId,
            since: { lte: today },
            OR: [{ until: { isNull: true } }, { until: { gt: today } }],
          },
        })
      : undefined;
    if (input.classId && !continuing)
      await tx
        .insert(s.enrolments)
        .values({ studentId: student.id, classId: input.classId, since: today })
        .onConflictDoNothing({
          target: [s.enrolments.studentId, s.enrolments.classId],
          where: isNull(s.enrolments.until),
        });
    await tx
      .delete(s.guardianships)
      .where(
        and(
          eq(s.guardianships.studentId, student.id),
          guardianIds.length
            ? notInArray(s.guardianships.guardianId, guardianIds)
            : undefined,
        ),
      );
    if (guardianIds.length)
      await tx
        .insert(s.guardianships)
        .values(
          guardianIds.map((guardianId) => ({
            guardianId,
            studentId: student.id,
            relation: "guardian" as const,
          })),
        )
        .onConflictDoNothing();
    return student;
  });
}

export async function saveClass(
  db: Database,
  input: SaveClassInput,
  schoolYearId: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    const teacherIds = new Set(
      [
        input.homeroomTeacherId,
        ...input.subjects.map((row) => row.teacherId),
      ].filter(Boolean),
    );
    const teachers = await tx.query.users.findMany({
      where: { role: "teacher", isActive: true },
      columns: { id: true },
    });
    if ([...teacherIds].some((id) => !teachers.some((row) => row.id === id)))
      throw new ManagementError(
        "BAD_REQUEST",
        "Choose active teacher accounts",
      );
    if (
      new Set(input.subjects.map((row) => row.subjectId)).size !==
      input.subjects.length
    )
      throw new ManagementError(
        "BAD_REQUEST",
        "Each subject may only be assigned once",
      );
    const subjects = await tx.query.subjects.findMany({
      columns: { id: true },
    });
    if (
      input.subjects.some(
        (row) => !subjects.some((subject) => subject.id === row.subjectId),
      )
    )
      throw new ManagementError("BAD_REQUEST", "Subject not found");
    if (
      await tx.query.classes.findFirst({
        where: {
          RAW: (table) =>
            sql`${and(eq(table.name, input.name), eq(table.schoolYearId, schoolYearId), input.id ? ne(table.id, input.id) : undefined)}`,
        },
      })
    )
      throw new ManagementError(
        "CONFLICT",
        "This class name is already used in the school year",
      );
    const values = {
      name: input.name,
      grade: input.grade,
      stage: input.stage,
      room: input.room || null,
      homeroomTeacherId: input.homeroomTeacherId || null,
      updatedAt: new Date(),
    };
    const [row] = input.id
      ? await tx
          .update(s.classes)
          .set(values)
          .where(
            and(
              eq(s.classes.id, input.id),
              eq(s.classes.schoolYearId, schoolYearId),
            ),
          )
          .returning({ id: s.classes.id })
      : await tx
          .insert(s.classes)
          .values({ ...values, schoolYearId })
          .returning({ id: s.classes.id });
    if (!row) throw new ManagementError("NOT_FOUND", "Class not found");
    await tx.delete(s.classSubjects).where(eq(s.classSubjects.classId, row.id));
    if (input.subjects.length)
      await tx
        .insert(s.classSubjects)
        .values(
          input.subjects.map((subject) => ({ classId: row.id, ...subject })),
        );
    return row;
  });
}

export async function managementOptions(
  db: Database,
  kind: "classes" | "teachers" | "parents" | "students" | "subjects",
  query: string,
  schoolYearId: string,
  selectedIds: string[] = [],
) {
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  if (kind === "classes")
    return db
      .select({ id: s.classes.id, name: s.classes.name })
      .from(s.classes)
      .where(
        and(
          eq(s.classes.schoolYearId, schoolYearId),
          or(
            ilike(s.classes.name, pattern),
            inArray(s.classes.id, selectedIds),
          ),
        ),
      )
      .orderBy(
        sql`case when ${inArray(s.classes.id, selectedIds)} then 0 else 1 end`,
        s.classes.name,
        s.classes.id,
      )
      .limit(50);
  if (kind === "subjects")
    return db
      .select({ id: s.subjects.id, name: s.subjects.name })
      .from(s.subjects)
      .where(
        or(
          ilike(s.subjects.name, pattern),
          inArray(s.subjects.id, selectedIds),
        ),
      )
      .orderBy(
        sql`case when ${inArray(s.subjects.id, selectedIds)} then 0 else 1 end`,
        s.subjects.name,
        s.subjects.id,
      )
      .limit(50);
  const role =
    kind === "teachers" ? "teacher" : kind === "parents" ? "parent" : "student";
  return db
    .select({
      id: s.users.id,
      name: sql<string>`${s.users.name} || ' · ' || ${s.users.email}`,
    })
    .from(s.users)
    .where(
      and(
        eq(s.users.role, role),
        or(
          and(
            eq(s.users.isActive, true),
            or(ilike(s.users.name, pattern), ilike(s.users.email, pattern)),
          ),
          inArray(s.users.id, selectedIds),
        ),
      ),
    )
    .orderBy(
      sql`case when ${inArray(s.users.id, selectedIds)} then 0 else 1 end`,
      s.users.name,
      s.users.id,
    )
    .limit(50);
}

export async function studentForManagement(
  db: Database,
  id: string,
  schoolYearId: string,
  today: string,
) {
  const student = await db.query.students.findFirst({ where: { id } });
  if (!student) throw new ManagementError("NOT_FOUND", "Student not found");
  const enrollment = await db.query.enrolments.findFirst({
    where: {
      studentId: id,
      since: { lte: today },
      OR: [{ until: { isNull: true } }, { until: { gt: today } }],
      class: { schoolYearId },
    },
  });
  return {
    id: student.id,
    reference: student.reference,
    firstName: student.firstName,
    lastName: student.lastName,
    birthdate: student.birthdate ?? "",
    userId: student.userId ?? "",
    classId: enrollment?.classId ?? "",
    guardianIds: (
      await db.query.guardianships.findMany({
        where: { studentId: id },
        columns: { guardianId: true },
      })
    ).map((row) => row.guardianId),
  };
}

export async function saveSubject(db: Database, input: SaveSubjectInput) {
  const { id, ...values } = input;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741906)`);
    if (
      await tx.query.subjects.findFirst({
        where: {
          RAW: (table) =>
            sql`${and(eq(table.slug, input.slug), id ? ne(table.id, id) : undefined)}`,
        },
      })
    )
      throw new ManagementError(
        "CONFLICT",
        "This subject code is already used",
      );
    const [saved] = id
      ? await tx
          .update(s.subjects)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(s.subjects.id, id))
          .returning({ id: s.subjects.id })
      : await tx
          .insert(s.subjects)
          .values(values)
          .returning({ id: s.subjects.id });
    if (!saved) throw new ManagementError("NOT_FOUND", "Subject not found");
    return saved;
  });
}
export async function publishNewsletter(
  db: Database,
  input: PublishNewsletterInput,
  schoolYearId: string,
) {
  const [saved] = await db
    .insert(s.newsletters)
    .values({ ...input, schoolYearId })
    .returning({ id: s.newsletters.id });
  if (!saved) throw new Error("Newsletter insert returned no row");
  return saved;
}
