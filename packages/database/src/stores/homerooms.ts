import type { OpenSpan } from "@faridalms/domain/school";

import { followingSpans } from "@faridalms/domain/homerooms";
import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { ClassRecord, ClassRow, Named, TeacherRow } from "./classes";
import type { Scope } from "./students";

import {
  homeroomClasses,
  homeroomMembers,
  homerooms,
} from "../tables/homerooms";
import { enrollments } from "../tables/teaching";
import {
  classColumns,
  classOf,
  rangeOf,
  spanOf,
  reached,
  studentsOn,
  teachersOf,
} from "./classes";
import { bounds, holds, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface HomeroomRow extends ClassRow {
  teachers: TeacherRow[];
  students: number;
  subjects: {
    classId: string;
    subjectId: string | null;
    teacher: Named | null;
  }[];
}

/**
 * The school's homerooms as the viewer reaches them on the date, each with
 * its teachers, how many students it has then and its subject classes:
 * those a module's view names, else those still running or yet to start,
 * or with `ended` those over.
 */
export async function homeroomDirectory(
  tx: Tx,
  scope: Scope,
  filter: {
    on: string;
    classIds: readonly string[] | null;
    ended: boolean;
    q: string;
    gradeIds: string[];
    locale: "ar" | "en";
  },
): Promise<HomeroomRow[]> {
  const q = filter.q.trim();
  const nameKey =
    filter.locale === "ar"
      ? sql`coalesce(c.title_ar, c.title_en) collate "ar-x-icu"`
      : sql`coalesce(c.title_en, c.title_ar) collate "en-x-icu"`;
  const rows = await tx.execute<ClassRecord & { students: number }>(sql`
    select ${classColumns}, ${studentsOn(filter.on)} as students
    from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id and c.status = 'active'
    where h.tenant_id = ${scope.tenantId}::uuid and h.org_id = ${scope.schoolId}::uuid
      and h.status = 'active'
      and ${
        filter.classIds
          ? sql`c.id = any(${uuidArray([...filter.classIds])})`
          : filter.ended
            ? sql`upper(c.runs) <= ${filter.on}::date`
            : sql`(upper_inf(c.runs) or upper(c.runs) > ${filter.on}::date)`
      }
      and c.id in ${reached(scope, filter.on)}
      and (${holds(q, [sql`c.code`, sql`c.title_en`, sql`c.title_ar`])})
      and (${filter.gradeIds.length === 0} or c.grade_level_descriptor_id = any(${uuidArray(filter.gradeIds)}))
    order by c.grade_level_descriptor_id, ${nameKey}, c.id`);
  const ids = rows.map((row) => row.id);
  const offerings = ids.length
    ? await tx.execute<{
        id: string;
        homeroom_class_id: string;
        subject_descriptor_id: string | null;
      }>(sql`
        select c.id, k.homeroom_class_id, c.subject_descriptor_id
        from core.homeroom_classes k
        join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id and c.status = 'active'
        where k.tenant_id = ${scope.tenantId}::uuid and k.status = 'active'
          and k.homeroom_class_id = any(${uuidArray(ids)})
        order by c.code`)
    : [];
  const teachers = await teachersOf(
    tx,
    scope.tenantId,
    [...ids, ...offerings.map((row) => row.id)],
    filter.on,
  );
  return rows.map((row) => ({
    ...classOf(row),
    students: row.students,
    teachers: teachers.get(row.id) ?? [],
    subjects: offerings
      .filter((offering) => offering.homeroom_class_id === row.id)
      .map((offering) => {
        const teacher = teachers.get(offering.id)?.[0];
        return {
          classId: offering.id,
          subjectId: offering.subject_descriptor_id,
          teacher: teacher
            ? {
                userId: teacher.userId,
                fullNameEn: teacher.fullNameEn,
                fullNameAr: teacher.fullNameAr,
              }
            : null,
        };
      }),
  }));
}

/** The homeroom classes running over some of the days. */
export async function homeroomClassIds(
  tx: Tx,
  input: { tenantId: string; schoolId: string; during: OpenSpan },
): Promise<string[]> {
  const rows = await tx.execute<{ class_id: string }>(sql`
    select h.class_id from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id and c.status = 'active'
    where h.tenant_id = ${input.tenantId}::uuid and h.org_id = ${input.schoolId}::uuid
      and h.status = 'active' and c.runs && ${rangeOf(input.during)}::daterange`);
  return rows.map((row) => row.class_id);
}

/** The subject classes taught to homerooms, running over some of the days. */
export async function subjectClassIds(
  tx: Tx,
  input: { tenantId: string; schoolId: string; during: OpenSpan },
): Promise<string[]> {
  const rows = await tx.execute<{ class_id: string }>(sql`
    select k.class_id from core.homeroom_classes k
    join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id and c.status = 'active'
    where k.tenant_id = ${input.tenantId}::uuid and k.org_id = ${input.schoolId}::uuid
      and k.status = 'active' and c.runs && ${rangeOf(input.during)}::daterange`);
  return rows.map((row) => row.class_id);
}

/** The homeroom a class is, or is taught to. */
export interface HomeroomOf {
  homeroomClassId: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  /** The class is the homeroom itself, not one of its subject classes. */
  own: boolean;
}

/** The homeroom each of these classes is, or is taught to; others are left out. */
export async function homeroomsOfClasses(
  tx: Tx,
  tenantId: string,
  classIds: readonly string[],
): Promise<Map<string, HomeroomOf>> {
  const result = new Map<string, HomeroomOf>();
  if (classIds.length === 0) return result;
  const rows = await tx.execute<{
    class_id: string;
    homeroom_class_id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select x.class_id, x.homeroom_class_id, c.code, c.title_en, c.title_ar
    from (
      select h.class_id, h.class_id as homeroom_class_id from core.homerooms h
      where h.tenant_id = ${tenantId}::uuid and h.status = 'active'
        and h.class_id = any(${uuidArray([...classIds])})
      union all
      select k.class_id, k.homeroom_class_id from core.homeroom_classes k
      where k.tenant_id = ${tenantId}::uuid and k.status = 'active'
        and k.class_id = any(${uuidArray([...classIds])})
    ) x
    join core.classes c on c.tenant_id = ${tenantId}::uuid and c.id = x.homeroom_class_id`);
  for (const row of rows)
    result.set(row.class_id, {
      homeroomClassId: row.homeroom_class_id,
      code: row.code,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      own: row.class_id === row.homeroom_class_id,
    });
  return result;
}

/** A homeroom's subject classes that are still taught to it. */
export async function linkedClasses(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  homeroomClassId: string,
): Promise<ClassRow[]> {
  const rows = await tx.execute<ClassRecord>(sql`
    select ${classColumns} from core.homeroom_classes k
    join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id and c.status = 'active'
    where k.tenant_id = ${scope.tenantId}::uuid and k.org_id = ${scope.schoolId}::uuid
      and k.status = 'active' and k.homeroom_class_id = ${homeroomClassId}::uuid
    order by c.code`);
  return rows.map(classOf);
}

/**
 * The classes the viewer reaches through a homeroom on the date: the
 * subject classes of a homeroom they reach, and the homeroom of a subject
 * class they reach.
 */
export async function reachedThroughHomerooms(
  tx: Tx,
  scope: Scope,
  on: string,
): Promise<string[]> {
  if (scope.schoolWide) return [];
  const rows = await tx.execute<{ class_id: string }>(sql`
    with seen as ${reached(scope, on)}
    select k.class_id from core.homeroom_classes k
    where k.tenant_id = ${scope.tenantId}::uuid and k.status = 'active'
      and k.homeroom_class_id in (select class_id from seen)
    union
    select k.homeroom_class_id from core.homeroom_classes k
    where k.tenant_id = ${scope.tenantId}::uuid and k.status = 'active'
      and k.class_id in (select class_id from seen)`);
  return rows.map((row) => row.class_id);
}

export interface StudentHomeroom {
  classId: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
}

/** Each student's homeroom on the date. */
export async function homeroomsOfStudents(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentIds: readonly string[],
  on: string,
): Promise<Map<string, StudentHomeroom>> {
  const result = new Map<string, StudentHomeroom>();
  if (studentIds.length === 0) return result;
  const rows = await tx.execute<{
    student_user_id: string;
    class_id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select m.student_user_id, c.id as class_id, c.code, c.title_en, c.title_ar
    from core.homeroom_members m
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.homeroom_class_id
    where m.tenant_id = ${scope.tenantId}::uuid and m.org_id = ${scope.schoolId}::uuid
      and m.student_user_id = any(${uuidArray([...studentIds])})
      and m.status = 'active' and m.valid_during @> ${on}::date`);
  for (const row of rows)
    result.set(row.student_user_id, {
      classId: row.class_id,
      code: row.code,
      titleEn: row.title_en,
      titleAr: row.title_ar,
    });
  return result;
}

export interface Membership {
  enrollmentId: string;
  /** The version of the enrollment in the homeroom class. */
  version: number;
  classId: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  from: string;
  to: string | null;
}

/** A student's places in the school's homerooms, newest first. */
export async function memberships(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentId: string,
): Promise<Membership[]> {
  const rows = await tx.execute<{
    enrollment_id: string;
    version: number;
    class_id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    valid_during: string;
  }>(sql`
    select m.enrollment_id, e.version, c.id as class_id, c.code, c.title_en, c.title_ar,
           m.valid_during::text as valid_during
    from core.homeroom_members m
    join core.enrollments e on e.tenant_id = m.tenant_id and e.id = m.enrollment_id
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.homeroom_class_id
    where m.tenant_id = ${scope.tenantId}::uuid and m.org_id = ${scope.schoolId}::uuid
      and m.student_user_id = ${studentId}::uuid and m.status = 'active'
    order by lower(m.valid_during) desc, m.id`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      enrollmentId: row.enrollment_id,
      version: row.version,
      classId: row.class_id,
      code: row.code,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      from: range.from,
      to: range.to,
    };
  });
}

export async function addHomeroom(
  tx: Tx,
  input: { tenantId: string; orgId: string; classId: string },
) {
  await tx.insert(homerooms).values(input);
}

export async function linkClass(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    homeroomClassId: string;
    classId: string;
    linkedOn: string;
  },
) {
  await tx.insert(homeroomClasses).values(input);
}

export async function unlinkClass(
  tx: Tx,
  input: { tenantId: string; classId: string },
) {
  await tx
    .update(homeroomClasses)
    .set({ status: "tobedeleted" })
    .where(
      and(
        eq(homeroomClasses.tenantId, input.tenantId),
        eq(homeroomClasses.classId, input.classId),
        eq(homeroomClasses.status, "active"),
      ),
    );
}

/**
 * Gives a student a place in a homeroom from the date to `endsBefore`, or
 * on with a homeroom that keeps running: their enrollment in the homeroom
 * class and the place that follows it.
 */
export async function placeMember(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    homeroomClassId: string;
    studentId: string;
    from: string;
    endsBefore: string | null;
    source: "manual" | "rollover";
  },
): Promise<string> {
  const validDuring = rangeOf({ from: input.from, to: input.endsBefore });
  const [row] = await tx
    .insert(enrollments)
    .values({
      tenantId: input.tenantId,
      classId: input.homeroomClassId,
      orgId: input.orgId,
      userId: input.studentId,
      role: "student",
      validDuring,
      source: "homeroom",
    })
    .returning({ id: enrollments.id });
  if (!row) throw new Error("enrollment was not created");
  await tx.insert(homeroomMembers).values({
    tenantId: input.tenantId,
    orgId: input.orgId,
    homeroomClassId: input.homeroomClassId,
    enrollmentId: row.id,
    studentUserId: input.studentId,
    validDuring,
    source: input.source,
  });
  return row.id;
}

interface Held extends OpenSpan {
  id: string;
  userId: string;
  classId: string;
  source: string;
}

/**
 * Writes the student enrollments of a homeroom's subject classes again from
 * its places: each place gives an enrollment in every subject class from the
 * day the class joined the homeroom, unless the student is in that class by
 * another enrollment then. An enrollment the homeroom wrote that no place
 * gives any more is ended at the place's new end, or tombstoned. Returns the
 * students added to each class.
 */
export async function followHomeroom(
  tx: Tx,
  input: { tenantId: string; homeroomClassId: string },
): Promise<Map<string, string[]>> {
  const members = await tx.execute<{
    student_user_id: string;
    valid_during: string;
  }>(sql`
    select student_user_id, valid_during::text as valid_during from core.homeroom_members
    where tenant_id = ${input.tenantId}::uuid and homeroom_class_id = ${input.homeroomClassId}::uuid
      and status = 'active'`);
  const links = await tx.execute<{
    class_id: string;
    linked_on: string;
    runs: string;
    org_id: string;
  }>(sql`
    select k.class_id, to_char(k.linked_on, 'YYYY-MM-DD') as linked_on, c.runs::text as runs, c.org_id
    from core.homeroom_classes k
    join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id and c.status = 'active'
    where k.tenant_id = ${input.tenantId}::uuid and k.status = 'active'
      and k.homeroom_class_id = ${input.homeroomClassId}::uuid`);
  const added = new Map<string, string[]>();
  if (links.length === 0) return added;
  const held = (
    await tx.execute<{
      id: string;
      user_id: string;
      class_id: string;
      source: string;
      valid_during: string;
    }>(sql`
      select id, user_id, class_id, source, valid_during::text as valid_during
      from core.enrollments
      where tenant_id = ${input.tenantId}::uuid and role = 'student' and status = 'active'
        and class_id = any(${uuidArray(links.map((link) => link.class_id))})
      for update`)
  ).map((row): Held => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      userId: row.user_id,
      classId: row.class_id,
      source: row.source,
      from: range.from,
      to: range.to,
    };
  });
  const places = new Map<string, OpenSpan[]>();
  for (const member of members) {
    const range = bounds(member.valid_during);
    places.set(member.student_user_id, [
      ...(places.get(member.student_user_id) ?? []),
      { from: range.from, to: range.to },
    ]);
  }
  for (const link of links) {
    const inClass = held.filter((row) => row.classId === link.class_id);
    const students = new Set([
      ...places.keys(),
      ...inClass
        .filter((row) => row.source === "homeroom")
        .map((row) => row.userId),
    ]);
    for (const studentId of students) {
      const mine = inClass.filter((row) => row.userId === studentId);
      const written = mine.filter((row) => row.source === "homeroom");
      const runs = spanOf(link.runs);
      const wanted = followingSpans(
        places.get(studentId) ?? [],
        link.linked_on > runs.from ? link.linked_on : runs.from,
        mine.filter((row) => row.source !== "homeroom"),
      ).flatMap((span) => {
        const to =
          runs.to === null || (span.to !== null && span.to <= runs.to)
            ? span.to
            : runs.to;
        return to === null || span.from < to ? [{ from: span.from, to }] : [];
      });
      for (const row of written) {
        const match = wanted.findIndex((span) => span.from === row.from);
        const span = wanted[match];
        if (span) {
          wanted.splice(match, 1);
          if (span.to !== row.to)
            await tx.execute(sql`
              update core.enrollments set valid_during = daterange(${span.from}::date, ${span.to}::date)
              where tenant_id = ${input.tenantId}::uuid and id = ${row.id}::uuid`);
        } else
          await tx.execute(sql`
            update core.enrollments set status = 'tobedeleted'
            where tenant_id = ${input.tenantId}::uuid and id = ${row.id}::uuid`);
      }
      if (wanted.length === 0) continue;
      await tx.insert(enrollments).values(
        wanted.map((span) => ({
          tenantId: input.tenantId,
          classId: link.class_id,
          orgId: link.org_id,
          userId: studentId,
          role: "student" as const,
          validDuring: rangeOf(span),
          source: "homeroom" as const,
        })),
      );
      added.set(link.class_id, [
        ...(added.get(link.class_id) ?? []),
        studentId,
      ]);
    }
  }
  return added;
}
