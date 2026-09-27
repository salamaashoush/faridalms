import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { ClassType, EnrollmentRole } from "../tables/teaching";
import type { Scope } from "./students";

import { classes, courses, enrollments } from "../tables/teaching";
import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

const reached = (scope: Scope, on: string) =>
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
  to: string;
}

export interface ClassRow {
  id: string;
  version: number;
  schoolYearId: string;
  classType: ClassType;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  courseId: string | null;
  homeroomClassId: string | null;
  subjectId: string | null;
  gradeId: string | null;
  locationId: string | null;
}

type ClassRecord = {
  id: string;
  version: number;
  school_year_id: string;
  class_type: ClassType;
  code: string;
  title_en: string | null;
  title_ar: string | null;
  course_id: string | null;
  homeroom_class_id: string | null;
  subject_descriptor_id: string | null;
  grade_level_descriptor_id: string | null;
  location_id: string | null;
};

function classOf(row: ClassRecord): ClassRow {
  return {
    id: row.id,
    version: row.version,
    schoolYearId: row.school_year_id,
    classType: row.class_type,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    courseId: row.course_id,
    homeroomClassId: row.homeroom_class_id,
    subjectId: row.subject_descriptor_id,
    gradeId: row.grade_level_descriptor_id,
    locationId: row.location_id,
  };
}

const classColumns = sql`c.id, c.version, c.school_year_id, c.class_type, c.code, c.title_en, c.title_ar,
  c.course_id, c.homeroom_class_id, c.subject_descriptor_id, c.grade_level_descriptor_id, c.location_id`;

/** Teachers and aides of each class on the date, primary teacher first. */
async function teachersOf(
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
      to: range.to ?? range.from,
    });
    result.set(row.class_id, list);
  }
  return result;
}

export interface DirectoryClass extends ClassRow {
  teachers: TeacherRow[];
  students: number;
  subjects: {
    classId: string;
    subjectId: string | null;
    teacher: Named | null;
  }[];
}

/**
 * A school year's homerooms as the viewer reaches them on the date, each
 * with its teachers, how many students it has then and its subject classes.
 */
export async function homeroomDirectory(
  tx: Tx,
  scope: Scope,
  filter: {
    yearId: string;
    on: string;
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
    select ${classColumns},
           (select count(*)::int from core.enrollments s
              where s.tenant_id = c.tenant_id and s.class_id = c.id and s.role = 'student'
                and s.status = 'active' and s.valid_during @> ${filter.on}::date) as students
    from core.classes c
    where c.tenant_id = ${scope.tenantId}::uuid and c.org_id = ${scope.schoolId}::uuid
      and c.school_year_id = ${filter.yearId}::uuid and c.class_type = 'homeroom' and c.status = 'active'
      and c.id in ${reached(scope, filter.on)}
      and (${q === ""} or c.code ilike ${`%${q}%`} or c.title_en ilike ${`%${q}%`} or c.title_ar ilike ${`%${q}%`})
      and (${filter.gradeIds.length === 0} or c.grade_level_descriptor_id = any(${uuidArray(filter.gradeIds)}))
    order by c.grade_level_descriptor_id, ${nameKey}, c.id`);
  const homerooms = rows.map((row) => ({
    ...classOf(row),
    students: row.students,
  }));
  const ids = homerooms.map((row) => row.id);
  const offerings = ids.length
    ? await tx.execute<{
        id: string;
        homeroom_class_id: string;
        subject_descriptor_id: string | null;
      }>(sql`
        select c.id, c.homeroom_class_id, c.subject_descriptor_id from core.classes c
        where c.tenant_id = ${scope.tenantId}::uuid and c.homeroom_class_id = any(${uuidArray(ids)})
          and c.status = 'active'
        order by c.code`)
    : [];
  const teachers = await teachersOf(
    tx,
    scope.tenantId,
    [...ids, ...offerings.map((row) => row.id)],
    filter.on,
  );
  return homerooms.map((homeroom) => ({
    ...homeroom,
    teachers: teachers.get(homeroom.id) ?? [],
    subjects: offerings
      .filter((row) => row.homeroom_class_id === homeroom.id)
      .map((row) => {
        const teacher = teachers.get(row.id)?.[0];
        return {
          classId: row.id,
          subjectId: row.subject_descriptor_id,
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

export interface TaughtClass extends ClassRow {
  role: EnrollmentRole;
  homeroomTitleEn: string | null;
  homeroomTitleAr: string | null;
  students: number;
}

/** The classes a person teaches or assists in a year, on the date. */
export async function classesTaughtBy(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: { userId: string; yearId: string; on: string },
): Promise<TaughtClass[]> {
  const rows = await tx.execute<
    ClassRecord & {
      role: EnrollmentRole;
      homeroom_title_en: string | null;
      homeroom_title_ar: string | null;
      students: number;
    }
  >(sql`
    select ${classColumns}, e.role, h.title_en as homeroom_title_en, h.title_ar as homeroom_title_ar,
           (select count(*)::int from core.enrollments s
              where s.tenant_id = c.tenant_id and s.class_id = coalesce(c.homeroom_class_id, c.id)
                and s.role = 'student' and s.status = 'active' and s.valid_during @> ${input.on}::date) as students
    from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id and c.status = 'active'
    left join core.classes h on h.tenant_id = c.tenant_id and h.id = c.homeroom_class_id
    where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
      and e.school_year_id = ${input.yearId}::uuid and e.user_id = ${input.userId}::uuid
      and e.role in ('teacher', 'aide') and e.status = 'active' and e.valid_during @> ${input.on}::date
    order by c.class_type, c.code`);
  return rows.map((row) => ({
    ...classOf(row),
    role: row.role,
    homeroomTitleEn: row.homeroom_title_en,
    homeroomTitleAr: row.homeroom_title_ar,
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
  subjects: (ClassRow & { teachers: TeacherRow[] })[];
  homeroom: ClassRow | null;
}

/** A class with its teachers, and its homeroom or its subject classes. */
export async function classDetail(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  classId: string,
  on: string,
): Promise<ClassDetail | null> {
  const row = await classById(tx, scope, classId);
  if (!row) return null;
  const subjects =
    row.classType === "homeroom"
      ? (
          await tx.execute<ClassRecord>(sql`
            select ${classColumns} from core.classes c
            where c.tenant_id = ${scope.tenantId}::uuid and c.homeroom_class_id = ${classId}::uuid
              and c.status = 'active'
            order by c.code`)
        ).map(classOf)
      : [];
  const homeroom = row.homeroomClassId
    ? await classById(tx, scope, row.homeroomClassId)
    : null;
  const teachers = await teachersOf(
    tx,
    scope.tenantId,
    [row.id, ...subjects.map((subject) => subject.id)],
    on,
  );
  return {
    ...row,
    teachers: teachers.get(row.id) ?? [],
    subjects: subjects.map((subject) => ({
      ...subject,
      teachers: teachers.get(subject.id) ?? [],
    })),
    homeroom,
  };
}

export interface RosterStudent extends Named {
  enrollmentId: string;
  version: number;
  reference: string | null;
  from: string;
  to: string;
}

/** Students in a class on the date: its homeroom's when it follows one. */
export async function classRoster(
  tx: Tx,
  scope: Scope,
  classRow: Pick<ClassRow, "id" | "homeroomClassId">,
  on: string,
  onlyReached: boolean,
): Promise<RosterStudent[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    reference: string | null;
    valid_during: string;
  }>(sql`
    select e.id, e.version, e.user_id, u.full_name_en, u.full_name_ar, e.valid_during::text as valid_during,
           (select x.identifier from core.external_ids x
              where x.tenant_id = u.tenant_id and x.user_id = u.id and x.system_meaning = 'school_reference'
                and x.status = 'active' and x.assigning_org_id = ${scope.schoolId}::uuid
              order by lower(x.valid_during) desc limit 1) as reference
    from core.enrollments e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id and u.status = 'active'
    where e.tenant_id = ${scope.tenantId}::uuid
      and e.class_id = ${classRow.homeroomClassId ?? classRow.id}::uuid
      and e.role = 'student' and e.status = 'active' and e.valid_during @> ${on}::date
      and (not ${onlyReached} or e.user_id in (select student_user_id from app.visible_students(
             ${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${on}::date, ${scope.schoolWide})))
    order by u.full_name_en, u.full_name_ar`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      enrollmentId: row.id,
      version: row.version,
      userId: row.user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      reference: row.reference,
      from: range.from,
      to: range.to ?? range.from,
    };
  });
}

export interface EnrollmentEpisode {
  id: string;
  version: number;
  classId: string;
  classType: ClassType;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  schoolYearId: string;
  yearTitleEn: string | null;
  yearTitleAr: string | null;
  from: string;
  to: string;
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
    class_type: ClassType;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    school_year_id: string;
    year_en: string | null;
    year_ar: string | null;
    valid_during: string;
  }>(sql`
    select e.id, e.version, e.class_id, e.class_type, c.code, c.title_en, c.title_ar, e.school_year_id,
           y.title_en as year_en, y.title_ar as year_ar, e.valid_during::text as valid_during
    from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    join core.academic_sessions y on y.tenant_id = e.tenant_id and y.id = e.school_year_id
    where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
      and e.user_id = ${studentId}::uuid and e.role = 'student' and e.status = 'active'
    order by lower(e.valid_during) desc, e.id`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      classId: row.class_id,
      classType: row.class_type,
      code: row.code,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      schoolYearId: row.school_year_id,
      yearTitleEn: row.year_en,
      yearTitleAr: row.year_ar,
      from: range.from,
      to: range.to ?? range.from,
    };
  });
}

/** Each student's homeroom on the date, for the student list's class column. */
export async function homeroomsOn(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentIds: readonly string[],
  on: string,
) {
  const result = new Map<
    string,
    { classId: string; titleEn: string | null; titleAr: string | null }
  >();
  if (studentIds.length === 0) return result;
  const rows = await tx.execute<{
    user_id: string;
    class_id: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select e.user_id, e.class_id, c.title_en, c.title_ar
    from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    where e.tenant_id = ${scope.tenantId}::uuid and e.org_id = ${scope.schoolId}::uuid
      and e.user_id = any(${uuidArray([...studentIds])}) and e.role = 'student' and e.class_type = 'homeroom'
      and e.status = 'active' and e.valid_during @> ${on}::date`);
  for (const row of rows)
    result.set(row.user_id, {
      classId: row.class_id,
      titleEn: row.title_en,
      titleAr: row.title_ar,
    });
  return result;
}

export async function insertClass(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    schoolYearId: string;
    classType: ClassType;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
    courseId: string | null;
    homeroomClassId: string | null;
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
      schoolYearId: input.schoolYearId,
      classType: input.classType,
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      courseId: input.courseId,
      homeroomClassId: input.homeroomClassId,
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

/** Retires a subject class; its enrollments end the same day. */
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
  const taken = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from core.courses
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid and status = 'active'
      and code like ${`${input.code}%`}`);
  const [row] = await tx
    .insert(courses)
    .values({
      tenantId: input.tenantId,
      orgId: input.orgId,
      code:
        (taken[0]?.n ?? 0) === 0
          ? input.code
          : `${input.code}-${(taken[0]?.n ?? 0) + 1}`,
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
    classRow: Pick<ClassRow, "id" | "classType" | "schoolYearId">;
    orgId: string;
    teacherIds: readonly string[];
    from: string;
    endsBefore: string;
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
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classRow.id}::uuid and role = 'teacher'
      and status = 'active' and upper(valid_during) > ${input.from}::date`);
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
        classId: input.classRow.id,
        classType: input.classRow.classType,
        schoolYearId: input.classRow.schoolYearId,
        orgId: input.orgId,
        userId,
        role: "teacher" as const,
        isPrimary: userId === primary,
        classroomPositionDescriptorId: input.positionId,
        validDuring: `[${input.from},${input.endsBefore})`,
        source: "manual" as const,
      })),
    );
}

async function endEnrollment(
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
      and upper(valid_during) > ${on}::date`);
  for (const row of held)
    await endEnrollment(tx, { tenantId, id: row.id, starts: row.starts, on });
}

export interface HomeroomPlacement {
  id: string;
  version: number;
  classId: string;
  from: string;
  to: string;
}

/** A student's homeroom enrollments in a year that have not ended by the date. */
export async function homeroomEnrollments(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: { studentId: string; yearId: string; on: string },
): Promise<HomeroomPlacement[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    class_id: string;
    valid_during: string;
  }>(sql`
    select id, version, class_id, valid_during::text as valid_during from core.enrollments
    where tenant_id = ${scope.tenantId}::uuid and org_id = ${scope.schoolId}::uuid
      and school_year_id = ${input.yearId}::uuid and user_id = ${input.studentId}::uuid
      and role = 'student' and class_type = 'homeroom' and status = 'active'
      and upper(valid_during) > ${input.on}::date
    order by lower(valid_during)`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      classId: row.class_id,
      from: range.from,
      to: range.to ?? range.from,
    };
  });
}

/** Puts a student in a homeroom from the date to the end of the year. */
export async function enrolStudent(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    classRow: Pick<ClassRow, "id" | "classType" | "schoolYearId">;
    studentId: string;
    from: string;
    endsBefore: string;
    source?: "manual" | "rollover";
  },
) {
  const [row] = await tx
    .insert(enrollments)
    .values({
      tenantId: input.tenantId,
      classId: input.classRow.id,
      classType: input.classRow.classType,
      schoolYearId: input.classRow.schoolYearId,
      orgId: input.orgId,
      userId: input.studentId,
      role: "student",
      validDuring: `[${input.from},${input.endsBefore})`,
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
