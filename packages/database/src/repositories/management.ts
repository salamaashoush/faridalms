import type {
  SaveSubjectInput,
  PublishNewsletterInput,
  SaveClassInput,
} from "@faridalms/domain/administration-schema";

import {
  INTERNATIONAL_PATTERN,
  nationalNumber,
  ONE_DIGIT_CODE_PATTERN,
  TWO_DIGIT_CODE_PATTERN,
} from "@faridalms/domain/phone";
import { and, eq, ilike, ne, sql, inArray, or } from "drizzle-orm";

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
