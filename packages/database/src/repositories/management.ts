import type {
  SaveSubjectInput,
  PublishNewsletterInput,
  SaveUserInput,
  SaveStudentInput,
  SaveClassInput,
  StudentMatchesInput,
} from "@faridalms/domain/administration-schema";

import {
  INTERNATIONAL_PATTERN,
  nationalNumber,
  ONE_DIGIT_CODE_PATTERN,
  TWO_DIGIT_CODE_PATTERN,
} from "@faridalms/domain/phone";
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

import type { Database, DatabaseTransaction } from "../index";

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
      throw new ManagementError("FORBIDDEN", "management.self_admin_removal");
    const duplicate = await tx.query.users.findFirst({
      where: {
        RAW: (table) =>
          sql`${and(sql`lower(${table.email}) = ${input.email.toLowerCase()}`, input.id ? ne(table.id, input.id) : undefined)}`,
      },
    });
    if (duplicate)
      throw new ManagementError("CONFLICT", "management.email_in_use");
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
        throw new ManagementError("NOT_FOUND", "management.account_not_found");
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
            "management.role_relationships",
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
      throw new ManagementError("BAD_REQUEST", "management.birthdate_future");
    if (
      input.classId &&
      !(await tx.query.classes.findFirst({
        where: { id: input.classId, schoolYearId },
      }))
    )
      throw new ManagementError("BAD_REQUEST", "management.class_not_current");
    const guardianIds = [...new Set(input.guardianIds ?? [])];
    const parents = guardianIds.length
      ? await tx.query.users.findMany({
          where: { id: { in: guardianIds }, role: "parent" },
          columns: { id: true },
        })
      : [];
    if (parents.length !== guardianIds.length)
      throw new ManagementError("BAD_REQUEST", "management.parents_invalid");
    if (
      input.userId &&
      !(await tx.query.users.findFirst({
        where: { id: input.userId, role: "student", isActive: true },
      }))
    )
      throw new ManagementError(
        "BAD_REQUEST",
        "management.student_account_invalid",
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
      throw new ManagementError("CONFLICT", "management.account_linked");
    if (
      await tx.query.students.findFirst({
        where: {
          RAW: (table) =>
            sql`${and(eq(table.reference, input.reference), input.id ? ne(table.id, input.id) : undefined)}`,
        },
      })
    )
      throw new ManagementError("CONFLICT", "management.reference_conflict");
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
    if (!student)
      throw new ManagementError("NOT_FOUND", "management.student_not_found");
    const scheduled = await tx.query.enrolments.findFirst({
      where: {
        studentId: student.id,
        since: { gt: today },
        class: { schoolYearId },
      },
    });
    if (scheduled)
      throw new ManagementError("CONFLICT", "enrollment.scheduled_conflict");
    const on = input.effectiveOn
      ? await changeDate(tx, student.id, input, schoolYearId, today)
      : today;
    await tx
      .update(s.enrolments)
      .set({ until: on, updatedAt: new Date() })
      .where(
        and(
          eq(s.enrolments.studentId, student.id),
          or(isNull(s.enrolments.until), gt(s.enrolments.until, on)),
          sql`${s.enrolments.classId} in (select ${s.classes.id} from ${s.classes} where ${s.classes.schoolYearId} = ${schoolYearId})`,
          input.classId ? ne(s.enrolments.classId, input.classId) : undefined,
        ),
      );
    const continuing = input.classId
      ? await tx.query.enrolments.findFirst({
          where: {
            studentId: student.id,
            classId: input.classId,
            since: { lte: on },
            OR: [{ until: { isNull: true } }, { until: { gt: on } }],
          },
        })
      : undefined;
    if (input.classId && !continuing)
      await tx
        .insert(s.enrolments)
        .values({ studentId: student.id, classId: input.classId, since: on })
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

/**
 * The day a requested class change takes effect. It may be backdated, but not
 * into the future, where saveStudent would refuse every later save of the
 * record as a scheduled placement, and not to before the current placement
 * began or an earlier one ended, so a student's placements never overlap.
 * Nor may it reach back over a register either class has already taken:
 * rosters come from placements, so the move would take the student off one
 * past register and put them, with the other class's mark, on another.
 * A save that keeps the class ignores it.
 */
async function changeDate(
  tx: DatabaseTransaction,
  studentId: string,
  input: SaveStudentInput,
  schoolYearId: string,
  today: string,
) {
  const effectiveOn = input.effectiveOn ?? today;
  const placements = await tx.query.enrolments.findMany({
    where: { studentId, class: { schoolYearId } },
    columns: { classId: true, since: true, until: true },
  });
  const current = placements.find(
    (row) => row.since <= today && (row.until === null || row.until > today),
  );
  if ((current?.classId ?? "") === (input.classId ?? "")) return today;
  if (effectiveOn > today)
    throw new ManagementError("BAD_REQUEST", "management.move_date_future");
  const year = await tx.query.schoolYears.findFirst({
    where: { id: schoolYearId },
    columns: { startsOn: true },
  });
  const earliest = placements
    .map((row) => (row === current ? row.since : (row.until ?? row.since)))
    .reduce(
      (latest, bound) => (bound > latest ? bound : latest),
      year && year.startsOn < today ? year.startsOn : today,
    );
  if (effectiveOn < earliest)
    throw new ManagementError("BAD_REQUEST", "management.move_date_early");
  // Today's registers change with the move, as they do for any move that
  // takes effect today; only earlier days are kept as they were taken.
  const classIds = [current?.classId, input.classId].filter(
    (id): id is string => Boolean(id),
  );
  const taken = await tx.query.attendance.findFirst({
    where: {
      date: { gte: effectiveOn, lt: today },
      OR: [{ studentId }, { classId: { in: classIds } }],
    },
    orderBy: { date: "desc" },
    columns: { date: true },
  });
  if (taken)
    throw new ManagementError(
      "CONFLICT",
      `management.move_date_registers:${taken.date}`,
    );
  return effectiveOn;
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
      throw new ManagementError("BAD_REQUEST", "management.teachers_inactive");
    if (
      new Set(input.subjects.map((row) => row.subjectId)).size !==
      input.subjects.length
    )
      throw new ManagementError("BAD_REQUEST", "management.subject_duplicate");
    const subjects = await tx.query.subjects.findMany({
      columns: { id: true },
    });
    if (
      input.subjects.some(
        (row) => !subjects.some((subject) => subject.id === row.subjectId),
      )
    )
      throw new ManagementError("BAD_REQUEST", "management.subject_not_found");
    if (
      await tx.query.classes.findFirst({
        where: {
          RAW: (table) =>
            sql`${and(eq(table.name, input.name), eq(table.schoolYearId, schoolYearId), input.id ? ne(table.id, input.id) : undefined)}`,
        },
      })
    )
      throw new ManagementError("CONFLICT", "management.class_name_conflict");
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
          .set({ ...values, revision: sql`${s.classes.revision} + 1` })
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
    if (!row)
      throw new ManagementError("NOT_FOUND", "management.class_not_found");
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
  studentId?: string,
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
  // saveStudent refuses an account that another student already uses, so it
  // is never offered.
  const unlinked =
    kind === "students"
      ? sql`not exists (select 1 from ${s.students} where ${s.students.userId} = ${s.users.id}${studentId ? sql` and ${s.students.id} <> ${studentId}` : sql``})`
      : undefined;
  // A parent's number is stored and searched however the office has it to
  // hand, so besides the digits as typed, which finds a fragment, both sides
  // are compared on the national number (see nationalNumber).
  const typed = query.replace(/\D/g, "");
  const wanted = nationalNumber(query);
  const unprefixed = typed.replace(/^0+/, "");
  const mobile = sql`coalesce(${s.users.mobile}, '')`;
  const mobileDigits = sql`regexp_replace(${mobile}, '[^0-9]', '', 'g')`;
  const withCode = sql`ltrim(${mobileDigits}, '0')`;
  const storedNational = sql`ltrim(case
    when not (${mobile} ~ ${INTERNATIONAL_PATTERN} or ${mobileDigits} like '00%') then ${mobileDigits}
    when ${withCode} ~ ${ONE_DIGIT_CODE_PATTERN} then substr(${withCode}, 2)
    when ${withCode} ~ ${TWO_DIGIT_CODE_PATTERN} then substr(${withCode}, 3)
    else substr(${withCode}, 4)
  end, '0')`;
  const phone =
    kind === "parents" && typed.length >= 4
      ? or(
          sql`${mobileDigits} like ${`%${typed}%`}`,
          wanted.length >= 4
            ? sql`${storedNational} like ${`%${wanted}%`}`
            : undefined,
          // A whole number typed with its country code but without + or 00,
          // against one stored nationally.
          unprefixed.length >= 8
            ? sql`(length(${storedNational}) >= 7 and ${unprefixed} like ('%' || ${storedNational}))`
            : undefined,
        )
      : undefined;
  // The number is isolated left to right (U+2066 to U+2069), or its spaced
  // groups would run in reverse order in an Arabic list.
  const label =
    kind === "parents"
      ? sql<string>`${s.users.name} || ' · ' || ${s.users.email} || coalesce(' · ' || chr(8294) || nullif(${s.users.mobile}, '') || chr(8297), '')`
      : sql<string>`${s.users.name} || ' · ' || ${s.users.email}`;
  return db
    .select({ id: s.users.id, name: label })
    .from(s.users)
    .where(
      and(
        eq(s.users.role, role),
        or(
          and(
            eq(s.users.isActive, true),
            or(
              ilike(s.users.name, pattern),
              ilike(s.users.email, pattern),
              phone,
            ),
            unlinked,
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

export async function studentsWithNameAndBirthdate(
  db: Database,
  input: StudentMatchesInput,
) {
  return db
    .select({
      id: s.students.id,
      reference: s.students.reference,
      firstName: s.students.firstName,
      lastName: s.students.lastName,
      birthdate: s.students.birthdate,
    })
    .from(s.students)
    .where(
      and(
        sql`lower(${s.students.firstName}) = lower(${input.firstName})`,
        sql`lower(${s.students.lastName}) = lower(${input.lastName})`,
        eq(s.students.birthdate, input.birthdate),
      ),
    )
    .orderBy(s.students.reference)
    .limit(5);
}

export async function studentForManagement(
  db: Database,
  id: string,
  schoolYearId: string,
  today: string,
) {
  const student = await db.query.students.findFirst({ where: { id } });
  if (!student)
    throw new ManagementError("NOT_FOUND", "management.student_not_found");
  const enrollment = await db.query.enrolments.findFirst({
    where: {
      studentId: id,
      since: { lte: today },
      OR: [{ until: { isNull: true } }, { until: { gt: today } }],
      class: { schoolYearId },
    },
  });
  const account = student.userId
    ? await db.query.users.findFirst({
        where: { id: student.userId },
        columns: { name: true, email: true },
      })
    : undefined;
  const guardianships = await db.query.guardianships.findMany({
    where: { studentId: id },
    columns: { guardianId: true },
    with: { guardian: { columns: { name: true } } },
  });
  return {
    account: account ?? null,
    guardians: guardianships.flatMap((row) =>
      row.guardian ? [{ id: row.guardianId, name: row.guardian.name }] : [],
    ),
    id: student.id,
    reference: student.reference,
    firstName: student.firstName,
    lastName: student.lastName,
    birthdate: student.birthdate ?? "",
    userId: student.userId ?? "",
    classId: enrollment?.classId ?? "",
    guardianIds: guardianships.map((row) => row.guardianId),
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
      throw new ManagementError("CONFLICT", "management.subject_code_conflict");
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
    if (!saved)
      throw new ManagementError("NOT_FOUND", "management.subject_not_found");
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
