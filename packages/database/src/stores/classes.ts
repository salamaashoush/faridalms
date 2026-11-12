import type { OpenSpan } from "@faridalms/domain/school";

import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { EnrollmentRole, EnrollmentSource } from "../tables/teaching";
import type { Scope } from "./students";

import { classes, courses, enrollments } from "../tables/teaching";
import { bounds, holds, uuidArray } from "./sql";

type Tx = CellTransaction;

export const reached = (scope: Scope, on: string) =>
  sql`(select class_id from app.visible_classes(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${on}::date, ${scope.schoolWide}))`;

export interface Named {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

export interface TeacherRow extends Named {
  enrollmentId: string;
  version: number;
  role: EnrollmentRole;
  isPrimary: boolean;
  from: string;
  to: string | null;
}

export interface ClassRow {
  id: string;
  version: number;
  /** The days the class runs; `to` is the day after its last, null while it keeps running. */
  runs: OpenSpan;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  courseId: string | null;
  subjectId: string | null;
  gradeId: string | null;
  locationId: string | null;
}

export type ClassRecord = {
  id: string;
  version: number;
  runs: string;
  code: string;
  title_en: string | null;
  title_ar: string | null;
  course_id: string | null;
  subject_descriptor_id: string | null;
  grade_level_descriptor_id: string | null;
  location_id: string | null;
};

export function classOf(row: ClassRecord): ClassRow {
  return {
    id: row.id,
    version: row.version,
    runs: spanOf(row.runs),
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    courseId: row.course_id,
    subjectId: row.subject_descriptor_id,
    gradeId: row.grade_level_descriptor_id,
    locationId: row.location_id,
  };
}

export const classColumns = sql`c.id, c.version, c.runs::text as runs, c.code, c.title_en, c.title_ar,
  c.course_id, c.subject_descriptor_id, c.grade_level_descriptor_id, c.location_id`;

export function spanOf(range: string): OpenSpan {
  const { from, to } = bounds(range);
  return { from, to };
}

/** A span as a Postgres daterange literal. */
export const rangeOf = (span: OpenSpan) => `[${span.from},${span.to ?? ""})`;

/** Teachers and aides of each class on the date, primary teacher first. */
export async function teachersOf(
  tx: Tx,
  tenantId: string,
  classIds: readonly string[],
  on: string,
): Promise<Map<string, TeacherRow[]>> {
  const result = new Map<string, TeacherRow[]>();
  if (classIds.length === 0) return result;
  const rows = await tx.execute<{
    id: string;
    version: number;
    class_id: string;
    user_id: string;
    role: EnrollmentRole;
    is_primary: boolean;
    valid_during: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select e.id, e.version, e.class_id, e.user_id, e.role, e.is_primary, e.valid_during::text as valid_during,
           u.full_name_en, u.full_name_ar
    from core.enrollments e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id
    where e.tenant_id = ${tenantId}::uuid and e.class_id = any(${uuidArray([...classIds])})
      and e.role in ('teacher', 'aide') and e.status = 'active' and e.valid_during @> ${on}::date
    order by e.is_primary desc, e.role, u.full_name_en`);
  for (const row of rows) {
    const range = bounds(row.valid_during);
    const list = result.get(row.class_id) ?? [];
    list.push({
      enrollmentId: row.id,
      version: row.version,
      userId: row.user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      role: row.role,
      isPrimary: row.is_primary,
      from: range.from,
      to: range.to,
    });
    result.set(row.class_id, list);
  }
  return result;
}

export interface DirectoryClass extends ClassRow {
  teachers: TeacherRow[];
  students: number;
}

/** Students enrolled in the class on the date. */
export const studentsOn = (on: string) =>
  sql`(select count(*)::int from core.enrollments s
    where s.tenant_id = c.tenant_id and s.class_id = c.id and s.role = 'student'
      and s.status = 'active' and s.valid_during @> ${on}::date)`;

/** Which classes a list shows, the class aliased `c`. */
export interface ClassesViewed {
  on: string;
  /** The classes a module's view names; null for the school's own. */
  classIds: readonly string[] | null;
  /** Without a module's view, those over rather than those still running or yet to start. */
  ended: boolean;
}

/** The condition a list's classes meet: those a view names, else those running on or after the day, or ended before it. */
export const viewedClasses = (filter: ClassesViewed) =>
  filter.classIds
    ? sql`c.id = any(${uuidArray([...filter.classIds])})`
    : filter.ended
      ? sql`upper(c.runs) <= ${filter.on}::date`
      : sql`(upper_inf(c.runs) or upper(c.runs) > ${filter.on}::date)`;

/**
 * The school's classes as the viewer reaches them on the date, each with its
 * teachers and how many students it has then: those a module's view names,
 * else those still running or yet to start, or with `ended` those over.
 */
export async function classDirectory(
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
): Promise<DirectoryClass[]> {
  const q = filter.q.trim();
  const nameKey =
    filter.locale === "ar"
      ? sql`coalesce(c.title_ar, c.title_en) collate "ar-x-icu"`
      : sql`coalesce(c.title_en, c.title_ar) collate "en-x-icu"`;
  const rows = await tx.execute<ClassRecord & { students: number }>(sql`
    select ${classColumns}, ${studentsOn(filter.on)} as students
    from core.classes c
    where c.tenant_id = ${scope.tenantId}::uuid and c.org_id = ${scope.schoolId}::uuid
      and c.status = 'active'
      and ${viewedClasses(filter)}
      and c.id in ${reached(scope, filter.on)}
      and (${holds(q, [sql`c.code`, sql`c.title_en`, sql`c.title_ar`])})
      and (${filter.gradeIds.length === 0} or c.grade_level_descriptor_id = any(${uuidArray(filter.gradeIds)}))
    order by c.grade_level_descriptor_id, ${nameKey}, c.id`);
  const teachers = await teachersOf(
    tx,
    scope.tenantId,
    rows.map((row) => row.id),
    filter.on,
  );
  return rows.map((row) => ({
    ...classOf(row),
    students: row.students,
    teachers: teachers.get(row.id) ?? [],
  }));
}

export interface TaughtClass extends ClassRow {
  role: EnrollmentRole;
  students: number;
}

/** The classes a person teaches or assists in on the date, of those named if any are. */
export async function classesTaughtBy(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: { userId: string; on: string; classIds?: readonly string[] | null },
): Promise<TaughtClass[]> {
  const rows = await tx.execute<
    ClassRecord & { role: EnrollmentRole; students: number }
  >(sql`
    select ${classColumns}, e.role, ${studentsOn(input.on)} as students
    from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id and c.status = 'active'
    where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
      and e.user_id = ${input.userId}::uuid
      and ${input.classIds ? sql`c.id = any(${uuidArray([...input.classIds])})` : sql`true`}
      and e.role in ('teacher', 'aide') and e.status = 'active' and e.valid_during @> ${input.on}::date
    order by c.code`);
  return rows.map((row) => ({
    ...classOf(row),
    role: row.role,
    students: row.students,
  }));
}

export async function reachesClass(
  tx: Tx,
  scope: Scope,
  classId: string,
  on: string,
) {
  const rows = await tx.execute<{ ok: boolean }>(
    sql`select ${classId}::uuid in ${reached(scope, on)} as ok`,
  );
  return rows[0]?.ok ?? false;
}

export interface ClassLabel {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
}

export async function classLabels(
  tx: Tx,
  tenantId: string,
  classIds: readonly string[],
): Promise<Map<string, ClassLabel>> {
  if (classIds.length === 0) return new Map();
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select id, code, title_en, title_ar from core.classes
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray([...classIds])})`);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        code: row.code,
        titleEn: row.title_en,
        titleAr: row.title_ar,
      },
    ]),
  );
}

/** The school's classes running on the date, by code. */
export async function classesRunning(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
) {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar from core.classes c
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and c.runs @> ${input.on}::date and c.status = 'active'
    order by c.code`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

export async function classById(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  classId: string,
) {
  const rows = await tx.execute<ClassRecord>(sql`
    select ${classColumns} from core.classes c
    where c.tenant_id = ${scope.tenantId}::uuid and c.org_id = ${scope.schoolId}::uuid and c.id = ${classId}::uuid
      and c.status = 'active'`);
  const row = rows[0];
  return row ? classOf(row) : null;
}

export interface ClassDetail extends ClassRow {
  teachers: TeacherRow[];
}

/** A class with its teachers on the date. */
export async function classDetail(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  classId: string,
  on: string,
): Promise<ClassDetail | null> {
  const row = await classById(tx, scope, classId);
  if (!row) return null;
  const teachers = await teachersOf(tx, scope.tenantId, [row.id], on);
  return { ...row, teachers: teachers.get(row.id) ?? [] };
}

export interface RosterStudent extends Named {
  enrollmentId: string;
  version: number;
  source: EnrollmentSource;
  reference: string | null;
  from: string;
  to: string | null;
}

/** Students enrolled in a class on the date. */
export async function classRoster(
  tx: Tx,
  scope: Scope,
  classId: string,
  on: string,
  onlyReached: boolean,
): Promise<RosterStudent[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    source: EnrollmentSource;
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    reference: string | null;
    valid_during: string;
  }>(sql`
    select e.id, e.version, e.source, e.user_id, u.full_name_en, u.full_name_ar, e.valid_during::text as valid_during,
           (select x.identifier from core.external_ids x
              where x.tenant_id = u.tenant_id and x.user_id = u.id and x.system_meaning = 'school_reference'
                and x.status = 'active' and x.assigning_org_id = ${scope.schoolId}::uuid
              order by lower(x.valid_during) desc limit 1) as reference
    from core.enrollments e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id and u.status = 'active'
    where e.tenant_id = ${scope.tenantId}::uuid
      and e.class_id = ${classId}::uuid
      and e.role = 'student' and e.status = 'active' and e.valid_during @> ${on}::date
      and (not ${onlyReached} or e.user_id in (select student_user_id from app.visible_students(
             ${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${on}::date, ${scope.schoolWide})))
    order by u.full_name_en, u.full_name_ar`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      enrollmentId: row.id,
      version: row.version,
      source: row.source,
      userId: row.user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      reference: row.reference,
      from: range.from,
      to: range.to,
    };
  });
}

export interface EnrollmentEpisode {
  id: string;
  version: number;
  classId: string;
  source: EnrollmentSource;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  from: string;
  to: string | null;
}

/** A student's class enrollments at the school, newest first. */
export async function enrollmentHistory(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentId: string,
): Promise<EnrollmentEpisode[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    class_id: string;
    source: EnrollmentSource;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    valid_during: string;
  }>(sql`
    select e.id, e.version, e.class_id, e.source, c.code, c.title_en, c.title_ar,
           e.valid_during::text as valid_during
    from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
      and e.user_id = ${studentId}::uuid and e.role = 'student' and e.status = 'active'
    order by lower(e.valid_during) desc, e.id`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      classId: row.class_id,
      source: row.source,
      code: row.code,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      from: range.from,
      to: range.to,
    };
  });
}

export async function insertClass(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    runs: OpenSpan;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
    courseId: string | null;
    subjectId: string | null;
    gradeId: string | null;
    locationId: string | null;
  },
) {
  const [row] = await tx
    .insert(classes)
    .values({
      tenantId: input.tenantId,
      orgId: input.orgId,
      runs: rangeOf(input.runs),
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      courseId: input.courseId,
      subjectDescriptorId: input.subjectId,
      gradeLevelDescriptorId: input.gradeId,
      locationId: input.locationId,
    })
    .returning({ id: classes.id, version: classes.version });
  if (!row) throw new Error("class was not created");
  return row;
}

/** Returns null when the class changed since the version the caller read. */
export async function updateClass(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number | null;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
    subjectId?: string | null;
    gradeId: string | null;
    locationId: string | null;
  },
) {
  const [row] = await tx
    .update(classes)
    .set({
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      ...(input.subjectId === undefined
        ? {}
        : { subjectDescriptorId: input.subjectId }),
      gradeLevelDescriptorId: input.gradeId,
      locationId: input.locationId,
    })
    .where(
      and(
        eq(classes.tenantId, input.tenantId),
        eq(classes.id, input.id),
        eq(classes.status, "active"),
        ...(input.expectedVersion === null
          ? []
          : [eq(classes.version, input.expectedVersion)]),
      ),
    )
    .returning({ id: classes.id, version: classes.version });
  return row ?? null;
}

/**
 * Moves a class to new dates and its enrollments with it: those running
 * past a new last day end then, and those that had not begun by it are
 * dropped; those that ran to an old edge run to the new one, as a student
 * in the class for all its days stays so. A first day moved past an active
 * enrollment's first is the caller's to refuse (`enrolledBefore`).
 */
export async function moveClassRuns(
  tx: Tx,
  input: {
    tenantId: string;
    classId: string;
    before: OpenSpan;
    after: OpenSpan;
  },
) {
  const { tenantId, classId, before, after } = input;
  const scope = sql`tenant_id = ${tenantId}::uuid and class_id = ${classId}::uuid and status = 'active'`;
  if (after.to !== null && (before.to === null || after.to < before.to))
    await endEnrollmentsOf(tx, tenantId, classId, after.to);
  await tx
    .update(classes)
    .set({ runs: rangeOf(after) })
    .where(and(eq(classes.tenantId, tenantId), eq(classes.id, classId)));
  if (before.to !== null && (after.to === null || after.to > before.to))
    await tx.execute(sql`
      update core.enrollments set valid_during = daterange(lower(valid_during), ${after.to}::date)
      where ${scope} and upper(valid_during) = ${before.to}::date`);
  if (after.from < before.from)
    await tx.execute(sql`
      update core.enrollments set valid_during = daterange(${after.from}::date, upper(valid_during))
      where ${scope} and lower(valid_during) = ${before.from}::date`);
}

/** Whether an active enrollment of the class begins before the date. */
export async function enrolledBefore(
  tx: Tx,
  tenantId: string,
  classId: string,
  day: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from core.enrollments
      where tenant_id = ${tenantId}::uuid and class_id = ${classId}::uuid and status = 'active'
        and lower(valid_during) < ${day}::date) as found`);
  return row?.found ?? false;
}

/** Retires a class; its enrollments end the same day. */
export async function retireClass(
  tx: Tx,
  tenantId: string,
  classId: string,
  on: string,
) {
  await endEnrollmentsOf(tx, tenantId, classId, on);
  await tx
    .update(classes)
    .set({ status: "tobedeleted" })
    .where(and(eq(classes.tenantId, tenantId), eq(classes.id, classId)));
}

const COURSE_CODE_MAX = 40;

/** The course for a subject at a grade in the school, made on first use. */
export async function ensureCourse(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    subjectId: string;
    gradeId: string | null;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  },
) {
  const found = await tx.execute<{ id: string }>(sql`
    select id from core.courses
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid and status = 'active'
      and subject_descriptor_id = ${input.subjectId}::uuid
      and grade_level_descriptor_id is not distinct from ${input.gradeId}::uuid
    order by created_at limit 1`);
  if (found[0]) return found[0].id;
  const stem = input.code.slice(0, COURSE_CODE_MAX - 4);
  const taken = new Set(
    (
      await tx.execute<{ code: string }>(sql`
        select code from core.courses
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid and status = 'active'
          and starts_with(code, ${stem})`)
    ).map((row) => row.code),
  );
  let code = input.code;
  for (let n = 2; taken.has(code); n += 1) {
    const suffix = `-${n}`;
    code = `${input.code.slice(0, COURSE_CODE_MAX - suffix.length)}${suffix}`;
  }
  const [row] = await tx
    .insert(courses)
    .values({
      tenantId: input.tenantId,
      orgId: input.orgId,
      code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      subjectDescriptorId: input.subjectId,
      gradeLevelDescriptorId: input.gradeId,
    })
    .returning({ id: courses.id });
  if (!row) throw new Error("course was not created");
  return row.id;
}

/**
 * Brings a class's teachers in line with the chosen people from the date:
 * a teacher no longer chosen ends then, or is withdrawn when they had not
 * started; a new one starts then; the first chosen is the primary teacher.
 */
export async function setClassTeachers(
  tx: Tx,
  input: {
    tenantId: string;
    classId: string;
    orgId: string;
    teacherIds: readonly string[];
    from: string;
    /** The day after the class's last, null while it keeps running. */
    endsBefore: string | null;
    positionId: string | null;
  },
) {
  const held = await tx.execute<{
    id: string;
    user_id: string;
    starts: string;
    is_primary: boolean;
  }>(sql`
    select id, user_id, lower(valid_during)::text as starts, is_primary from core.enrollments
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid and role = 'teacher'
      and status = 'active' and (upper_inf(valid_during) or upper(valid_during) > ${input.from}::date)`);
  const wanted = [...new Set(input.teacherIds)];
  const primary = wanted[0] ?? null;
  for (const row of held) {
    if (wanted.includes(row.user_id)) {
      if (row.is_primary !== (row.user_id === primary))
        await tx.execute(sql`
          update core.enrollments set is_primary = ${row.user_id === primary}
          where tenant_id = ${input.tenantId}::uuid and id = ${row.id}::uuid`);
      continue;
    }
    await endEnrollment(tx, {
      tenantId: input.tenantId,
      id: row.id,
      starts: row.starts,
      on: input.from,
    });
  }
  const current = new Set(held.map((row) => row.user_id));
  const added = wanted.filter((userId) => !current.has(userId));
  if (added.length)
    await tx.insert(enrollments).values(
      added.map((userId) => ({
        tenantId: input.tenantId,
        classId: input.classId,
        orgId: input.orgId,
        userId,
        role: "teacher" as const,
        isPrimary: userId === primary,
        classroomPositionDescriptorId: input.positionId,
        validDuring: rangeOf({ from: input.from, to: input.endsBefore }),
        source: "manual" as const,
      })),
    );
}

/**
 * Ends one enrollment on the date: one that began earlier keeps its days
 * before it, one that had not begun is tombstoned.
 */
export async function endEnrollment(
  tx: Tx,
  input: { tenantId: string; id: string; starts: string; on: string },
) {
  if (input.starts >= input.on)
    await tx.execute(sql`
      update core.enrollments set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
  else
    await tx.execute(sql`
      update core.enrollments set valid_during = daterange(lower(valid_during), ${input.on}::date)
      where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
}

async function endEnrollmentsOf(
  tx: Tx,
  tenantId: string,
  classId: string,
  on: string,
) {
  const held = await tx.execute<{ id: string; starts: string }>(sql`
    select id, lower(valid_during)::text as starts from core.enrollments
    where tenant_id = ${tenantId}::uuid and class_id = ${classId}::uuid and status = 'active'
      and (upper_inf(valid_during) or upper(valid_during) > ${on}::date)`);
  for (const row of held)
    await endEnrollment(tx, { tenantId, id: row.id, starts: row.starts, on });
}

/**
 * Ends every class enrollment a student holds past the date and tells how
 * each stood: those cut short with the end they had, and those that were
 * only to start by then, which are dropped.
 */
export async function endStudentEnrollmentsFrom(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: { studentId: string; on: string },
): Promise<{
  ended: { id: string; until: string | null }[];
  dropped: string[];
}> {
  const held = await tx.execute<{
    id: string;
    starts: string;
    until: string | null;
  }>(sql`
    select id, lower(valid_during)::text as starts, upper(valid_during)::text as until
    from core.enrollments
    where tenant_id = ${scope.tenantId}::uuid and org_id = ${scope.schoolId}::uuid
      and user_id = ${input.studentId}::uuid and role = 'student' and status = 'active'
      and (upper_inf(valid_during) or upper(valid_during) > ${input.on}::date)
    for update`);
  for (const row of held)
    await endEnrollment(tx, {
      tenantId: scope.tenantId,
      id: row.id,
      starts: row.starts,
      on: input.on,
    });
  return {
    ended: held
      .filter((row) => row.starts < input.on)
      .map((row) => ({ id: row.id, until: row.until })),
    dropped: held.filter((row) => row.starts >= input.on).map((row) => row.id),
  };
}

/**
 * Gives back what ending a student's enrollments took: each cut short runs
 * to the end it had again, each dropped is active again. One whose class
 * has since changed its dates so that it no longer fits is left as it is,
 * and not counted.
 */
export async function restoreStudentEnrollments(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: {
    studentId: string;
    ended: readonly { id: string; until: string | null }[];
    dropped: readonly string[];
  },
): Promise<string[]> {
  const restored: string[] = [];
  const fits = sql`exists (select 1 from core.classes c
    where c.tenant_id = e.tenant_id and c.id = e.class_id and c.status = 'active'`;
  for (const row of input.ended) {
    const [done] = await tx.execute<{ id: string }>(sql`
      update core.enrollments e set valid_during = daterange(lower(e.valid_during), ${row.until}::date)
      where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
        and e.user_id = ${input.studentId}::uuid and e.id = ${row.id}::uuid and e.status = 'active'
        and ${fits} and c.runs @> daterange(lower(e.valid_during), ${row.until}::date))
      returning e.id`);
    if (done) restored.push(done.id);
  }
  for (const id of input.dropped) {
    const [done] = await tx.execute<{ id: string }>(sql`
      update core.enrollments e set status = 'active'
      where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
        and e.user_id = ${input.studentId}::uuid and e.id = ${id}::uuid and e.status = 'tobedeleted'
        and ${fits} and c.runs @> e.valid_during)
      returning e.id`);
    if (done) restored.push(done.id);
  }
  return restored;
}

/** Puts a student in a class from the date to the class's end, or on with it. */
export async function enrolStudent(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    classId: string;
    studentId: string;
    from: string;
    endsBefore: string | null;
    source?: EnrollmentSource;
  },
) {
  const [row] = await tx
    .insert(enrollments)
    .values({
      tenantId: input.tenantId,
      classId: input.classId,
      orgId: input.orgId,
      userId: input.studentId,
      role: "student",
      validDuring: rangeOf({ from: input.from, to: input.endsBefore }),
      source: input.source ?? "manual",
    })
    .returning({ id: enrollments.id });
  if (!row) throw new Error("enrollment was not created");
  return row.id;
}

/** Ends one enrollment on the date; false when it changed since it was read. */
export async function endStudentEnrollment(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number; on: string },
) {
  const rows = await tx.execute<{ id: string; starts: string }>(sql`
    select id, lower(valid_during)::text as starts from core.enrollments
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and version = ${input.expectedVersion}
      and status = 'active'`);
  const row = rows[0];
  if (!row) return false;
  await endEnrollment(tx, {
    tenantId: input.tenantId,
    id: row.id,
    starts: row.starts,
    on: input.on,
  });
  return true;
}

export async function roomsOf(tx: Tx, tenantId: string, schoolId: string) {
  const rows = await tx.execute<{
    id: string;
    code: string | null;
    name_en: string | null;
    name_ar: string | null;
  }>(sql`
    select id, code, name_en, name_ar from core.locations
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid and status = 'active'
    order by code nulls last, name_en`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nameEn: row.name_en,
    nameAr: row.name_ar,
  }));
}

/**
 * The classes the viewer keeps (sets and grades work in, takes registers
 * for): every class for school-wide staff, otherwise those they teach or
 * assist in, at any point of the class's year. Reaching a class without
 * teaching it is not enough to keep it.
 */
export const taughtClasses = (scope: Scope) =>
  sql`(select c.id from core.classes c
    where c.tenant_id = ${scope.tenantId}::uuid and c.org_id = ${scope.schoolId}::uuid and c.status = 'active'
      and (${scope.schoolWide} or exists (
        select 1 from core.enrollments e
        where e.tenant_id = c.tenant_id and e.class_id = c.id and e.user_id = ${scope.viewerId}::uuid
          and e.role in ('teacher', 'aide') and e.status = 'active')))`;

export interface KeptClass extends ClassRow {
  /** The viewer's own role in the class, or null for one they oversee. */
  role: EnrollmentRole | null;
  students: number;
}

/**
 * The classes viewed that the viewer keeps (see `taughtClasses`), read on
 * the view's day: their own first, then, for school-wide staff, the rest of
 * the school's. A class that ended is the viewer's if they taught it at all.
 */
export async function classesKeptBy(
  tx: Tx,
  scope: Scope,
  viewed: ClassesViewed,
): Promise<KeptClass[]> {
  const rows = await tx.execute<
    ClassRecord & { role: EnrollmentRole | null; students: number }
  >(sql`
    select ${classColumns}, own.role, ${studentsOn(viewed.on)} as students
    from core.classes c
    left join lateral (
      select e.role from core.enrollments e
      where e.tenant_id = c.tenant_id and e.class_id = c.id and e.user_id = ${scope.viewerId}::uuid
        and e.role in ('teacher', 'aide') and e.status = 'active'
        and (${viewed.ended} or e.valid_during @> ${viewed.on}::date)
      order by e.role = 'teacher' desc
      limit 1) own on true
    where c.tenant_id = ${scope.tenantId}::uuid and c.org_id = ${scope.schoolId}::uuid
      and ${viewedClasses(viewed)} and c.status = 'active'
      and c.id in ${taughtClasses(scope)}
      and (${scope.schoolWide} or own.role is not null)
    order by own.role is null, c.code`);
  return rows.map((row) => ({
    ...classOf(row),
    role: row.role,
    students: row.students,
  }));
}

export async function teachesClass(
  tx: Tx,
  scope: Scope,
  classId: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ taught: boolean }>(sql`
    select ${classId}::uuid in ${taughtClasses(scope)} as taught`);
  return row?.taught ?? false;
}

export async function rosterOf(
  tx: Tx,
  tenantId: string,
  classId: string,
  on: string,
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct e.user_id from core.enrollments e
    where e.tenant_id = ${tenantId}::uuid and e.role = 'student' and e.status = 'active'
      and e.valid_during @> ${on}::date and e.class_id = ${classId}::uuid`);
  return rows.map((row) => row.user_id);
}

/** Who teaches a class on a day. */
export async function teachersOn(
  tx: Tx,
  tenantId: string,
  classId: string,
  on: string,
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct e.user_id from core.enrollments e
    where e.tenant_id = ${tenantId}::uuid and e.class_id = ${classId}::uuid
      and e.role in ('teacher', 'aide') and e.status = 'active' and e.valid_during @> ${on}::date`);
  return rows.map((row) => row.user_id);
}

export interface GroupRow {
  id: string;
  version: number;
  titleEn: string | null;
  titleAr: string | null;
  studentIds: string[];
}

export async function groupsOf(
  tx: Tx,
  tenantId: string,
  classId: string,
): Promise<GroupRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    title_en: string | null;
    title_ar: string | null;
    student_ids: string[] | null;
  }>(sql`
    select g.id, g.version, g.title_en, g.title_ar,
      array(select m.student_user_id from core.class_group_members m
        where m.tenant_id = g.tenant_id and m.group_id = g.id and m.status = 'active')::text[] as student_ids
    from core.class_groups g
    where g.tenant_id = ${tenantId}::uuid and g.class_id = ${classId}::uuid and g.status = 'active'
    order by coalesce(g.title_en, g.title_ar), g.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    studentIds: row.student_ids ?? [],
  }));
}
