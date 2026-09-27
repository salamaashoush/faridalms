import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { ClassType } from "../tables/teaching";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface GridOwner {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  classType: ClassType;
}

/** The classes a timetable is planned by: homerooms and classes of their own. */
export async function gridOwners(
  tx: Tx,
  input: { tenantId: string; schoolId: string; yearId: string },
): Promise<GridOwner[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    class_type: ClassType;
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar, c.class_type from core.classes c
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and c.school_year_id = ${input.yearId}::uuid and c.status = 'active'
      and (c.class_type = 'homeroom' or c.homeroom_class_id is null)
    order by c.class_type, c.code`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    classType: row.class_type,
  }));
}

export interface GroupClass {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  subjectId: string | null;
  teachers: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
    isPrimary: boolean;
  }[];
}

/**
 * The classes a grid places: a homeroom's subject classes, or a class of its
 * own that no homeroom holds. Teachers come primary first.
 */
export async function groupClasses(
  tx: Tx,
  input: { tenantId: string; groupId: string; on: string },
): Promise<GroupClass[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    subject_descriptor_id: string | null;
    teachers: {
      user_id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
      is_primary: boolean;
    }[];
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar, c.subject_descriptor_id,
           coalesce((select jsonb_agg(jsonb_build_object(
               'user_id', u.id, 'full_name_en', u.full_name_en, 'full_name_ar', u.full_name_ar,
               'is_primary', e.is_primary) order by e.is_primary desc, u.full_name_en)
             from core.enrollments e
             join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id
             where e.tenant_id = c.tenant_id and e.class_id = c.id and e.status = 'active'
               and e.role in ('teacher', 'aide') and e.valid_during @> ${input.on}::date), '[]'::jsonb)
             as teachers
    from core.classes c
    where c.tenant_id = ${input.tenantId}::uuid and c.status = 'active'
      and c.class_type = 'scheduled'
      and (c.homeroom_class_id = ${input.groupId}::uuid
           or (c.id = ${input.groupId}::uuid and c.homeroom_class_id is null))
    order by c.code`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    subjectId: row.subject_descriptor_id,
    teachers: row.teachers.map((teacher) => ({
      userId: teacher.user_id,
      fullNameEn: teacher.full_name_en,
      fullNameAr: teacher.full_name_ar,
      isPrimary: teacher.is_primary,
    })),
  }));
}

export interface MeetingRow {
  id: string;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  classType: ClassType;
  groupClassId: string;
  groupCode: string;
  groupTitleEn: string | null;
  groupTitleAr: string | null;
  weekday: number;
  periodId: string;
  teacherId: string | null;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  roomId: string | null;
  roomCode: string | null;
  roomNameEn: string | null;
  roomNameAr: string | null;
  from: string;
  clashAccepted: boolean;
  /** Another meeting shares this teacher or room at the same time. */
  clashing: boolean;
}

type MeetingFilter =
  | { groupIds: readonly string[]; classIds?: readonly string[] }
  | { teacherId: string }
  | { roomId: string }
  | { schoolId: string; clashesOnly: true };

function filterOf(filter: MeetingFilter): SQL {
  if ("teacherId" in filter)
    return sql`m.teacher_user_id = ${filter.teacherId}::uuid`;
  if ("roomId" in filter) return sql`m.location_id = ${filter.roomId}::uuid`;
  if ("clashesOnly" in filter)
    return sql`m.org_id = ${filter.schoolId}::uuid and m.clash_accepted`;
  return sql`(m.group_class_id = any(${uuidArray(filter.groupIds)})
    or m.class_id = any(${uuidArray(filter.classIds ?? [])}))`;
}

/** The meetings in force on a day, for a grid, a teacher, a room or a student. */
export async function meetingsOn(
  tx: Tx,
  input: { tenantId: string; on: string; filter: MeetingFilter },
): Promise<MeetingRow[]> {
  const rows = await tx.execute<{
    id: string;
    class_id: string;
    class_code: string;
    class_title_en: string | null;
    class_title_ar: string | null;
    class_type: ClassType;
    group_class_id: string;
    group_code: string;
    group_title_en: string | null;
    group_title_ar: string | null;
    weekday: number;
    class_period_id: string;
    teacher_user_id: string | null;
    teacher_en: string | null;
    teacher_ar: string | null;
    location_id: string | null;
    room_code: string | null;
    room_en: string | null;
    room_ar: string | null;
    from_day: string;
    clash_accepted: boolean;
    clashing: boolean;
  }>(sql`
    select m.id, m.class_id, c.code as class_code, c.title_en as class_title_en,
           c.title_ar as class_title_ar, c.class_type, m.group_class_id, g.code as group_code,
           g.title_en as group_title_en, g.title_ar as group_title_ar, m.weekday, m.class_period_id,
           m.teacher_user_id, u.full_name_en as teacher_en, u.full_name_ar as teacher_ar,
           m.location_id, l.code as room_code, l.name_en as room_en, l.name_ar as room_ar,
           to_char(lower(m.valid_during), 'YYYY-MM-DD') as from_day, m.clash_accepted,
           exists (select 1 from core.class_meetings o
             where o.tenant_id = m.tenant_id and o.id <> m.id and o.status = 'active'
               and o.weekday = m.weekday and o.class_period_id = m.class_period_id
               and o.valid_during @> ${input.on}::date
               and ((m.teacher_user_id is not null and o.teacher_user_id = m.teacher_user_id)
                    or (m.location_id is not null and o.location_id = m.location_id))) as clashing
    from core.class_meetings m
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.class_id
    join core.classes g on g.tenant_id = m.tenant_id and g.id = m.group_class_id
    left join core.users u on u.tenant_id = m.tenant_id and u.id = m.teacher_user_id
    left join core.locations l on l.tenant_id = m.tenant_id and l.id = m.location_id
    where m.tenant_id = ${input.tenantId}::uuid and m.status = 'active'
      and m.valid_during @> ${input.on}::date and ${filterOf(input.filter)}
    order by m.weekday, m.class_period_id, g.code, c.code`);
  return rows.map((row) => ({
    id: row.id,
    classId: row.class_id,
    classCode: row.class_code,
    classTitleEn: row.class_title_en,
    classTitleAr: row.class_title_ar,
    classType: row.class_type,
    groupClassId: row.group_class_id,
    groupCode: row.group_code,
    groupTitleEn: row.group_title_en,
    groupTitleAr: row.group_title_ar,
    weekday: row.weekday,
    periodId: row.class_period_id,
    teacherId: row.teacher_user_id,
    teacherNameEn: row.teacher_en,
    teacherNameAr: row.teacher_ar,
    roomId: row.location_id,
    roomCode: row.room_code,
    roomNameEn: row.room_en,
    roomNameAr: row.room_ar,
    from: row.from_day,
    clashAccepted: row.clash_accepted,
    clashing: row.clashing,
  }));
}

export interface Booking {
  id: string;
  kind: "teacher" | "room";
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  from: string;
}

/**
 * Meetings of other grids that already hold a teacher or room at this time
 * on some day from `from` to the end of the year.
 */
export async function bookingsAt(
  tx: Tx,
  input: {
    tenantId: string;
    groupId: string;
    weekday: number;
    periodId: string;
    from: string;
    teacherId: string | null;
    roomId: string | null;
  },
): Promise<Booking[]> {
  if (!input.teacherId && !input.roomId) return [];
  const rows = await tx.execute<{
    id: string;
    kind: "teacher" | "room";
    code: string;
    title_en: string | null;
    title_ar: string | null;
    from_day: string;
  }>(sql`
    select m.id,
           case when m.teacher_user_id = ${input.teacherId}::uuid then 'teacher' else 'room' end as kind,
           c.code, c.title_en, c.title_ar, to_char(lower(m.valid_during), 'YYYY-MM-DD') as from_day
    from core.class_meetings m
    join core.classes c on c.tenant_id = m.tenant_id and c.id = m.class_id
    where m.tenant_id = ${input.tenantId}::uuid and m.status = 'active'
      and m.group_class_id <> ${input.groupId}::uuid
      and m.weekday = ${input.weekday} and m.class_period_id = ${input.periodId}::uuid
      and upper(m.valid_during) > ${input.from}::date
      and (m.teacher_user_id = ${input.teacherId}::uuid or m.location_id = ${input.roomId}::uuid)
    order by c.code`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    classCode: row.code,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
    from: row.from_day,
  }));
}

/**
 * Ends meetings from a day: one that started earlier keeps its past days and
 * stops there; one that had not started yet is tombstoned.
 */
async function endFrom(tx: Tx, tenantId: string, where: SQL, from: string) {
  await tx.execute(sql`
    update core.class_meetings m set status = 'tobedeleted'
    where m.tenant_id = ${tenantId}::uuid and m.status = 'active'
      and lower(m.valid_during) >= ${from}::date and ${where}`);
  const rows = await tx.execute<{ id: string }>(sql`
    update core.class_meetings m
    set valid_during = daterange(lower(m.valid_during), ${from}::date, '[)')
    where m.tenant_id = ${tenantId}::uuid and m.status = 'active'
      and m.valid_during @> ${from}::date and ${where}
    returning m.id`);
  return rows.length;
}

/** Empties a grid's cell from a day on. */
export function endCell(
  tx: Tx,
  input: {
    tenantId: string;
    groupId: string;
    weekday: number;
    periodId: string;
    from: string;
  },
) {
  return endFrom(
    tx,
    input.tenantId,
    sql`m.group_class_id = ${input.groupId}::uuid and m.weekday = ${input.weekday}
      and m.class_period_id = ${input.periodId}::uuid`,
    input.from,
  );
}

/** Ends the meetings a placement takes a teacher or room from. */
export function endMeetings(
  tx: Tx,
  input: { tenantId: string; ids: readonly string[]; from: string },
) {
  if (input.ids.length === 0) return Promise.resolve(0);
  return endFrom(
    tx,
    input.tenantId,
    sql`m.id = any(${uuidArray(input.ids)})`,
    input.from,
  );
}

export async function insertMeeting(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    classId: string;
    classType: ClassType;
    yearId: string;
    groupId: string;
    weekday: number;
    periodId: string;
    teacherId: string | null;
    roomId: string | null;
    from: string;
    endsBefore: string;
    clashAccepted: boolean;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.class_meetings
      (tenant_id, org_id, class_id, class_type, school_year_id, group_class_id, weekday,
       class_period_id, teacher_user_id, location_id, valid_during, clash_accepted)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.classId}::uuid,
            ${input.classType}, ${input.yearId}::uuid, ${input.groupId}::uuid, ${input.weekday},
            ${input.periodId}::uuid, ${input.teacherId}::uuid, ${input.roomId}::uuid,
            daterange(${input.from}::date, ${input.endsBefore}::date, '[)'), ${input.clashAccepted})
    returning id`);
  if (!row) throw new Error("meeting not written");
  return row.id;
}

/** The homerooms and classes of their own a student sits in on a day. */
export async function studentGroups(
  tx: Tx,
  input: { tenantId: string; studentId: string; on: string },
): Promise<{ groupIds: string[]; classIds: string[] }> {
  const rows = await tx.execute<{ class_id: string; class_type: ClassType }>(
    sql`
    select distinct e.class_id, e.class_type from core.enrollments e
    where e.tenant_id = ${input.tenantId}::uuid and e.user_id = ${input.studentId}::uuid
      and e.role = 'student' and e.status = 'active' and e.valid_during @> ${input.on}::date`,
  );
  return {
    groupIds: rows
      .filter((row) => row.class_type === "homeroom")
      .map((row) => row.class_id),
    classIds: rows
      .filter((row) => row.class_type === "scheduled")
      .map((row) => row.class_id),
  };
}

export interface TeacherOption {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

/** Everyone who teaches or assists a class of the year, for the picker. */
export async function yearTeachers(
  tx: Tx,
  input: { tenantId: string; schoolId: string; yearId: string },
): Promise<TeacherOption[]> {
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct u.id, u.full_name_en, u.full_name_ar from core.enrollments e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id
    where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.schoolId}::uuid
      and e.school_year_id = ${input.yearId}::uuid and e.status = 'active'
      and e.role in ('teacher', 'aide')
    order by u.full_name_en, u.id`);
  return rows.map((row) => ({
    userId: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}
