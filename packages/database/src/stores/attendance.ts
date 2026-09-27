import type {
  AttendanceMeaning,
  AttendanceSettings,
  RegisterMark,
} from "@faridalms/domain/attendance";
import type { SQL } from "drizzle-orm";

import { DEFAULT_ATTENDANCE_SETTINGS } from "@faridalms/domain/attendance";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { RegisterState } from "../tables/attendance";
import type { ClassType } from "../tables/teaching";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export class AttendanceConflict extends Error {
  constructor(readonly code: "attendance.stale" | "attendance.not_roster") {
    super(code);
    this.name = "AttendanceConflict";
  }
}

export interface StoredSettings extends AttendanceSettings {
  version: number;
}

export async function settingsOf(
  tx: Tx,
  tenantId: string,
  schoolId: string,
): Promise<StoredSettings> {
  const [row] = await tx.execute<{
    version: number;
    teacher_edit_days: number;
    notice_delay_minutes: number;
    chronic_percent: number;
  }>(sql`
    select version, teacher_edit_days, notice_delay_minutes, chronic_percent
    from core.attendance_settings
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid and status = 'active'`);
  if (!row) return { version: 0, ...DEFAULT_ATTENDANCE_SETTINGS };
  return {
    version: row.version,
    teacherEditDays: row.teacher_edit_days,
    noticeDelayMinutes: row.notice_delay_minutes,
    chronicPercent: row.chronic_percent,
  };
}

/** Writes a school's rules if nobody changed them since `expectedVersion`. */
export async function saveSettings(
  tx: Tx,
  input: AttendanceSettings & {
    tenantId: string;
    schoolId: string;
    expectedVersion: number;
  },
): Promise<number> {
  if (input.expectedVersion === 0) {
    const rows = await tx.execute<{ version: number }>(sql`
      insert into core.attendance_settings
        (tenant_id, org_id, teacher_edit_days, notice_delay_minutes, chronic_percent)
      values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.teacherEditDays},
              ${input.noticeDelayMinutes}, ${input.chronicPercent})
      on conflict do nothing
      returning version`);
    if (!rows[0]) throw new AttendanceConflict("attendance.stale");
    return rows[0].version;
  }
  const rows = await tx.execute<{ version: number }>(sql`
    update core.attendance_settings
    set teacher_edit_days = ${input.teacherEditDays},
        notice_delay_minutes = ${input.noticeDelayMinutes},
        chronic_percent = ${input.chronicPercent}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active' and version = ${input.expectedVersion}
    returning version`);
  if (!rows[0]) throw new AttendanceConflict("attendance.stale");
  return rows[0].version;
}

export interface Descriptor {
  id: string;
  code: string;
  meaning: string;
  labelEn: string | null;
  labelAr: string | null;
}

/** The categories and reasons a register offers, in the school's order. */
export async function attendanceCodes(
  tx: Tx,
  tenantId: string,
): Promise<{ categories: Descriptor[]; reasons: Descriptor[] }> {
  const rows = await tx.execute<{
    id: string;
    namespace: string;
    code_value: string;
    system_meaning: string | null;
    label_en: string | null;
    label_ar: string | null;
  }>(sql`
    select id, namespace, code_value, system_meaning, label_en, label_ar from core.descriptors
    where tenant_id = ${tenantId}::uuid and status = 'active'
      and namespace in ('attendance_category', 'attendance_reason')
      and effective_during @> current_date
    order by namespace, sort_order, code_value`);
  const of = (namespace: string) =>
    rows
      .filter((row) => row.namespace === namespace)
      .map((row) => ({
        id: row.id,
        code: row.code_value,
        meaning: row.system_meaning ?? row.code_value,
        labelEn: row.label_en,
        labelAr: row.label_ar,
      }));
  return {
    categories: of("attendance_category"),
    reasons: of("attendance_reason"),
  };
}

const SCHOOL_DAY_MEANINGS = new Set([
  "instructional_day",
  "exam_day",
  "early_dismissal",
  "make_up_day",
]);

/**
 * Whether the school calendar holds lessons on a day: false on weekends,
 * holidays and closures, null where the calendar says nothing about it.
 */
export async function isSchoolDay(
  tx: Tx,
  input: { tenantId: string; yearId: string; day: string },
): Promise<boolean | null> {
  const rows = await tx.execute<{ meaning: string | null }>(sql`
    select e.system_meaning as meaning from core.calendar_dates d
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${input.tenantId}::uuid and d.school_year_id = ${input.yearId}::uuid
      and d.day_on = ${input.day}::date and d.status = 'active'`);
  if (rows.length === 0) return null;
  return rows.some((row) => SCHOOL_DAY_MEANINGS.has(row.meaning ?? ""));
}

export interface PeriodRow {
  id: string;
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  sequence: number;
  kind: "lesson" | "registration" | "break" | "other";
  startTime: string | null;
  endTime: string | null;
  official: boolean;
}

/** The periods of a school day registers can be taken in. */
export async function periodsOn(
  tx: Tx,
  input: { tenantId: string; schoolId: string; yearId: string; day: string },
): Promise<PeriodRow[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    name_en: string | null;
    name_ar: string | null;
    sequence: number;
    kind: PeriodRow["kind"];
    start_time: string | null;
    end_time: string | null;
    official_attendance: boolean;
  }>(sql`
    select id, code, name_en, name_ar, sequence, kind,
           to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
           official_attendance
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and school_year_id = ${input.yearId}::uuid and status = 'active'
      and valid_during @> ${input.day}::date and kind in ('lesson', 'registration')
    order by sequence`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    sequence: row.sequence,
    kind: row.kind,
    startTime: row.start_time,
    endTime: row.end_time,
    official: row.official_attendance,
  }));
}

export interface RegisterRow {
  id: string;
  version: number;
  state: RegisterState;
  recordedByUserId: string;
  recordedByNameEn: string | null;
  recordedByNameAr: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export async function registerFor(
  tx: Tx,
  input: { tenantId: string; classId: string; day: string; periodId: string },
): Promise<RegisterRow | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    state: RegisterState;
    recorded_by_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    submitted_at: string | null;
    updated_at: string;
  }>(sql`
    select g.id, g.version, g.state, g.recorded_by_user_id, u.full_name_en, u.full_name_ar,
           to_char(g.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as submitted_at,
           to_char(g.date_last_modified at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from core.attendance_registers g
    join core.users u on u.tenant_id = g.tenant_id and u.id = g.recorded_by_user_id
    where g.tenant_id = ${input.tenantId}::uuid and g.class_id = ${input.classId}::uuid
      and g.taken_on = ${input.day}::date and g.class_period_id = ${input.periodId}::uuid
      and g.status = 'active'`);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    state: row.state,
    recordedByUserId: row.recorded_by_user_id,
    recordedByNameEn: row.full_name_en,
    recordedByNameAr: row.full_name_ar,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

export interface MarkRow {
  id: string;
  studentId: string;
  meaning: AttendanceMeaning;
  categoryId: string;
  reasonId: string | null;
  minutes: number | null;
  note: string | null;
}

export async function marksOf(
  tx: Tx,
  input: { tenantId: string; registerId: string; day: string },
): Promise<MarkRow[]> {
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    category_meaning: AttendanceMeaning;
    category_descriptor_id: string;
    reason_descriptor_id: string | null;
    minutes: number | null;
    note: string | null;
  }>(sql`
    select id, student_user_id, category_meaning, category_descriptor_id, reason_descriptor_id,
           minutes, note
    from core.attendance_events
    where tenant_id = ${input.tenantId}::uuid and taken_on = ${input.day}::date
      and register_id = ${input.registerId}::uuid and status = 'active'`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_user_id,
    meaning: row.category_meaning,
    categoryId: row.category_descriptor_id,
    reasonId: row.reason_descriptor_id,
    minutes: row.minutes,
    note: row.note,
  }));
}

export interface EarlierMark {
  studentId: string;
  meaning: AttendanceMeaning;
  periodNameEn: string | null;
  periodNameAr: string | null;
}

/**
 * What other registers of the day already say about these students, so a
 * teacher taking period 3 sees who was marked absent at registration.
 */
export async function otherMarksOn(
  tx: Tx,
  input: {
    tenantId: string;
    day: string;
    studentIds: readonly string[];
    excludeRegisterId: string | null;
  },
): Promise<EarlierMark[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    student_user_id: string;
    category_meaning: AttendanceMeaning;
    name_en: string | null;
    name_ar: string | null;
  }>(sql`
    select e.student_user_id, e.category_meaning, p.name_en, p.name_ar
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.class_periods p on p.tenant_id = g.tenant_id and p.id = g.class_period_id
    where e.tenant_id = ${input.tenantId}::uuid and e.taken_on = ${input.day}::date
      and e.status = 'active' and e.category_meaning <> 'present'
      and e.student_user_id = any(${uuidArray(input.studentIds)})
      and (${input.excludeRegisterId}::uuid is null or e.register_id <> ${input.excludeRegisterId}::uuid)
    order by p.sequence`);
  return rows.map((row) => ({
    studentId: row.student_user_id,
    meaning: row.category_meaning,
    periodNameEn: row.name_en,
    periodNameAr: row.name_ar,
  }));
}

export interface MarkChange {
  studentId: string;
  before: Pick<MarkRow, "meaning" | "reasonId" | "minutes" | "note"> | null;
  after: Pick<MarkRow, "meaning" | "reasonId" | "minutes" | "note"> | null;
}

/**
 * Writes a register and its marks. The register is created at version 0 or
 * updated only from the version the teacher loaded; marks not sent any more
 * are tombstoned, so the register always says exactly what was saved.
 */
export async function writeRegister(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    classId: string;
    classType: ClassType;
    yearId: string;
    periodId: string;
    day: string;
    expectedVersion: number;
    state: RegisterState;
    marks: readonly RegisterMark[];
    categoryOf: (meaning: AttendanceMeaning) => string;
    actorId: string;
  },
): Promise<{ id: string; version: number; changes: MarkChange[] }> {
  const existing = await registerFor(tx, input);
  let registerId: string;
  let version: number;
  if (!existing) {
    if (input.expectedVersion !== 0)
      throw new AttendanceConflict("attendance.stale");
    const rows = await tx.execute<{ id: string; version: number }>(sql`
      insert into core.attendance_registers
        (tenant_id, org_id, class_id, class_type, school_year_id, class_period_id, taken_on,
         state, recorded_by_user_id, submitted_at)
      values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.classId}::uuid,
              ${input.classType}, ${input.yearId}::uuid, ${input.periodId}::uuid, ${input.day}::date,
              ${input.state}, ${input.actorId}::uuid,
              case when ${input.state} = 'submitted' then statement_timestamp() end)
      on conflict do nothing
      returning id, version`);
    if (!rows[0]) throw new AttendanceConflict("attendance.stale");
    ({ id: registerId, version } = rows[0]);
  } else {
    if (existing.version !== input.expectedVersion)
      throw new AttendanceConflict("attendance.stale");
    const rows = await tx.execute<{ id: string; version: number }>(sql`
      update core.attendance_registers
      set state = ${input.state}, recorded_by_user_id = ${input.actorId}::uuid,
          submitted_at = case when ${input.state} = 'submitted'
                              then coalesce(submitted_at, statement_timestamp()) end
      where tenant_id = ${input.tenantId}::uuid and id = ${existing.id}::uuid
        and version = ${input.expectedVersion}
      returning id, version`);
    if (!rows[0]) throw new AttendanceConflict("attendance.stale");
    ({ id: registerId, version } = rows[0]);
  }
  const before = new Map(
    (
      await marksOf(tx, {
        tenantId: input.tenantId,
        registerId,
        day: input.day,
      })
    ).map((mark) => [mark.studentId, mark]),
  );
  const changes: MarkChange[] = [];
  const inserts: SQL[] = [];
  const updates: SQL[] = [];
  for (const mark of input.marks) {
    const after = {
      meaning: mark.meaning,
      reasonId: mark.reasonId || null,
      minutes: mark.minutes,
      note: mark.note || null,
    };
    const row = sql`${input.categoryOf(after.meaning)}::uuid, ${after.meaning}::text,
      ${after.reasonId}::uuid, ${after.minutes}::smallint, ${after.note}::text`;
    const previous = before.get(mark.studentId);
    before.delete(mark.studentId);
    if (!previous) {
      inserts.push(sql`(${mark.studentId}::uuid, ${row})`);
      changes.push({ studentId: mark.studentId, before: null, after });
      continue;
    }
    if (
      previous.meaning === after.meaning &&
      previous.reasonId === after.reasonId &&
      previous.minutes === after.minutes &&
      previous.note === after.note
    )
      continue;
    updates.push(sql`(${previous.id}::uuid, ${row})`);
    changes.push({
      studentId: mark.studentId,
      before: {
        meaning: previous.meaning,
        reasonId: previous.reasonId,
        minutes: previous.minutes,
        note: previous.note,
      },
      after,
    });
  }
  if (updates.length > 0)
    await tx.execute(sql`
      update core.attendance_events e
      set category_descriptor_id = v.category_id, category_meaning = v.meaning,
          reason_descriptor_id = v.reason_id, minutes = v.minutes, note = v.note,
          recorded_by_user_id = ${input.actorId}::uuid
      from (values ${sql.join(updates, sql`, `)})
        as v(id, category_id, meaning, reason_id, minutes, note)
      where e.tenant_id = ${input.tenantId}::uuid and e.taken_on = ${input.day}::date
        and e.id = v.id`);
  if (inserts.length > 0)
    await tx.execute(sql`
      insert into core.attendance_events
        (tenant_id, taken_on, register_id, recorded_by_user_id, student_user_id,
         category_descriptor_id, category_meaning, reason_descriptor_id, minutes, note)
      select ${input.tenantId}::uuid, ${input.day}::date, ${registerId}::uuid,
             ${input.actorId}::uuid, v.*
      from (values ${sql.join(inserts, sql`, `)})
        as v(student_user_id, category_id, meaning, reason_id, minutes, note)`);
  if (before.size > 0) {
    await tx.execute(sql`
      update core.attendance_events set status = 'tobedeleted',
             recorded_by_user_id = ${input.actorId}::uuid
      where tenant_id = ${input.tenantId}::uuid and taken_on = ${input.day}::date
        and id = any(${uuidArray([...before.values()].map((mark) => mark.id))})`);
    for (const previous of before.values())
      changes.push({
        studentId: previous.studentId,
        before: {
          meaning: previous.meaning,
          reasonId: previous.reasonId,
          minutes: previous.minutes,
          note: previous.note,
        },
        after: null,
      });
  }
  return { id: registerId, version, changes };
}

export interface BoardRow {
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  classType: ClassType;
  periodId: string;
  periodNameEn: string | null;
  periodNameAr: string | null;
  periodSequence: number;
  registerId: string | null;
  state: RegisterState | "not_started";
  recordedByNameEn: string | null;
  recordedByNameAr: string | null;
  submittedAt: string | null;
  students: number;
  counts: Record<AttendanceMeaning, number>;
}

/**
 * A school day's registers: every homeroom's daily register and every class
 * the timetable has meeting that day, taken or not, and any other register
 * taken that day.
 */
export async function dayBoard(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    yearId: string;
    day: string;
    officialPeriodId: string | null;
  },
): Promise<BoardRow[]> {
  const rows = await tx.execute<{
    class_id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    class_type: ClassType;
    period_id: string;
    period_name_en: string | null;
    period_name_ar: string | null;
    period_sequence: number;
    register_id: string | null;
    state: RegisterState | null;
    full_name_en: string | null;
    full_name_ar: string | null;
    submitted_at: string | null;
    students: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    left_early: number;
  }>(sql`
    with expected as (
      select c.id as class_id, ${input.officialPeriodId}::uuid as period_id
      from core.classes c
      where ${input.officialPeriodId}::uuid is not null
        and c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
        and c.school_year_id = ${input.yearId}::uuid and c.class_type = 'homeroom'
        and c.status = 'active'
      union
      select m.class_id, m.class_period_id from core.class_meetings m
      where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
        and m.school_year_id = ${input.yearId}::uuid and m.status = 'active'
        and m.valid_during @> ${input.day}::date
        and m.weekday = extract(isodow from ${input.day}::date)
      union
      select g.class_id, g.class_period_id from core.attendance_registers g
      where g.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
        and g.taken_on = ${input.day}::date and g.status = 'active'
    )
    select c.id as class_id, c.code, c.title_en, c.title_ar, c.class_type,
           p.id as period_id, p.name_en as period_name_en, p.name_ar as period_name_ar,
           p.sequence as period_sequence, g.id as register_id, g.state,
           u.full_name_en, u.full_name_ar,
           to_char(g.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as submitted_at,
           (select count(distinct s.user_id)::int from core.enrollments s
              where s.tenant_id = c.tenant_id and s.class_id = coalesce(c.homeroom_class_id, c.id)
                and s.role = 'student' and s.status = 'active'
                and s.valid_during @> ${input.day}::date) as students,
           count(e.id) filter (where e.category_meaning = 'present')::int as present,
           count(e.id) filter (where e.category_meaning = 'absent')::int as absent,
           count(e.id) filter (where e.category_meaning = 'late')::int as late,
           count(e.id) filter (where e.category_meaning = 'excused')::int as excused,
           count(e.id) filter (where e.category_meaning = 'left_early')::int as left_early
    from expected x
    join core.classes c on c.tenant_id = ${input.tenantId}::uuid and c.id = x.class_id
    join core.class_periods p on p.tenant_id = c.tenant_id and p.id = x.period_id
    left join core.attendance_registers g on g.tenant_id = c.tenant_id and g.class_id = c.id
      and g.class_period_id = p.id and g.taken_on = ${input.day}::date and g.status = 'active'
    left join core.users u on u.tenant_id = g.tenant_id and u.id = g.recorded_by_user_id
    left join core.attendance_events e on e.tenant_id = g.tenant_id and e.taken_on = ${input.day}::date
      and e.register_id = g.id and e.status = 'active'
    group by c.id, c.code, c.title_en, c.title_ar, c.class_type, c.tenant_id, c.homeroom_class_id,
             p.id, p.name_en, p.name_ar, p.sequence, g.id, g.state, u.full_name_en, u.full_name_ar,
             g.submitted_at
    order by p.sequence, c.class_type, c.code`);
  return rows.map((row) => ({
    classId: row.class_id,
    classCode: row.code,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
    classType: row.class_type,
    periodId: row.period_id,
    periodNameEn: row.period_name_en,
    periodNameAr: row.period_name_ar,
    periodSequence: row.period_sequence,
    registerId: row.register_id,
    state: row.state ?? "not_started",
    recordedByNameEn: row.full_name_en,
    recordedByNameAr: row.full_name_ar,
    submittedAt: row.submitted_at,
    students: row.students,
    counts: {
      present: row.present,
      absent: row.absent,
      late: row.late,
      excused: row.excused,
      left_early: row.left_early,
    },
  }));
}

export interface AbsenceRow {
  id: string;
  date: string;
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  periodNameEn: string | null;
  periodNameAr: string | null;
  meaning: AttendanceMeaning;
  reasonId: string | null;
  minutes: number | null;
  note: string | null;
}

/** Absences and late arrivals across the school, unexplained first. */
export async function absencesBetween(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    from: string;
    to: string;
    unexplainedOnly: boolean;
    q: string;
    limit: number;
  },
): Promise<AbsenceRow[]> {
  const rows = await tx.execute<{
    id: string;
    taken_on: string;
    student_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    class_id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    period_name_en: string | null;
    period_name_ar: string | null;
    category_meaning: AttendanceMeaning;
    reason_descriptor_id: string | null;
    minutes: number | null;
    note: string | null;
  }>(sql`
    select e.id, to_char(e.taken_on, 'YYYY-MM-DD') as taken_on, e.student_user_id,
           u.full_name_en, u.full_name_ar, c.id as class_id, c.code, c.title_en, c.title_ar,
           p.name_en as period_name_en, p.name_ar as period_name_ar, e.category_meaning,
           e.reason_descriptor_id, e.minutes, e.note
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    join core.class_periods p on p.tenant_id = g.tenant_id and p.id = g.class_period_id
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.student_user_id
    where e.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
      and e.taken_on between ${input.from}::date and ${input.to}::date and e.status = 'active'
      and (case when ${input.unexplainedOnly}
                then e.category_meaning in ('absent', 'late') and e.reason_descriptor_id is null
                else e.category_meaning <> 'present' end)
      and (${input.q === ""} or u.full_name_en ilike ${`%${input.q}%`}
           or u.full_name_ar ilike ${`%${input.q}%`})
    order by (e.reason_descriptor_id is null and e.category_meaning in ('absent', 'late')) desc,
             e.taken_on desc, p.sequence, c.code, u.full_name_en, e.id
    limit ${input.limit}`);
  return rows.map((row) => ({
    id: row.id,
    date: row.taken_on,
    studentId: row.student_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    classId: row.class_id,
    classCode: row.code,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
    periodNameEn: row.period_name_en,
    periodNameAr: row.period_name_ar,
    meaning: row.category_meaning,
    reasonId: row.reason_descriptor_id,
    minutes: row.minutes,
    note: row.note,
  }));
}

/**
 * Gives absences and late arrivals a reason; an absence becomes excused.
 * Returns what each mark was, for the audit.
 */
export async function excuseMarks(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    marks: readonly { id: string; date: string }[];
    reasonId: string;
    note: string;
    excusedCategoryId: string;
    actorId: string;
  },
): Promise<
  {
    id: string;
    studentId: string;
    date: string;
    before: AttendanceMeaning;
    after: AttendanceMeaning;
  }[]
> {
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    taken_on: string;
    before: AttendanceMeaning;
    after: AttendanceMeaning;
  }>(sql`
    with target as (
      select e.tenant_id, e.taken_on, e.id, e.category_meaning as before
      from core.attendance_events e
      join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
      join (select * from unnest(${uuidArray(input.marks.map((mark) => mark.id))},
                                 ${sql`array[${sql.join(
                                   input.marks.map(
                                     (mark) => sql`${mark.date}::date`,
                                   ),
                                   sql`, `,
                                 )}]`}) as m(id, taken_on)) m
        on m.id = e.id and m.taken_on = e.taken_on
      where e.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
        and e.status = 'active' and e.category_meaning in ('absent', 'late', 'excused')
      for update of e
    )
    update core.attendance_events e
    set category_meaning = case when t.before = 'late' then 'late' else 'excused' end,
        category_descriptor_id = case when t.before = 'late' then e.category_descriptor_id
                                      else ${input.excusedCategoryId}::uuid end,
        reason_descriptor_id = ${input.reasonId}::uuid,
        note = coalesce(nullif(${input.note}, ''), e.note),
        recorded_by_user_id = ${input.actorId}::uuid
    from target t
    where e.tenant_id = t.tenant_id and e.taken_on = t.taken_on and e.id = t.id
    returning e.id, e.student_user_id, to_char(e.taken_on, 'YYYY-MM-DD') as taken_on,
              t.before, e.category_meaning as after`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_user_id,
    date: row.taken_on,
    before: row.before,
    after: row.after,
  }));
}

export interface StudentMark {
  id: string;
  date: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  periodNameEn: string | null;
  periodNameAr: string | null;
  official: boolean;
  meaning: AttendanceMeaning;
  reasonId: string | null;
  minutes: number | null;
  note: string | null;
}

/**
 * One student's year: daily counts from the registers that count as daily
 * attendance, and every mark other than present from any register.
 */
export async function studentAttendance(
  tx: Tx,
  input: { tenantId: string; studentId: string; from: string; to: string },
): Promise<{
  counts: Record<AttendanceMeaning, number>;
  marks: StudentMark[];
}> {
  const [counts] = await tx.execute<Record<AttendanceMeaning, number>>(sql`
    select count(*) filter (where e.category_meaning = 'present')::int as present,
           count(*) filter (where e.category_meaning = 'absent')::int as absent,
           count(*) filter (where e.category_meaning = 'late')::int as late,
           count(*) filter (where e.category_meaning = 'excused')::int as excused,
           count(*) filter (where e.category_meaning = 'left_early')::int as left_early
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.class_periods p on p.tenant_id = g.tenant_id and p.id = g.class_period_id
    where e.tenant_id = ${input.tenantId}::uuid and e.student_user_id = ${input.studentId}::uuid
      and e.taken_on between ${input.from}::date and ${input.to}::date and e.status = 'active'
      and p.official_attendance`);
  const rows = await tx.execute<{
    id: string;
    taken_on: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    name_en: string | null;
    name_ar: string | null;
    official_attendance: boolean;
    category_meaning: AttendanceMeaning;
    reason_descriptor_id: string | null;
    minutes: number | null;
    note: string | null;
  }>(sql`
    select e.id, to_char(e.taken_on, 'YYYY-MM-DD') as taken_on, c.code, c.title_en, c.title_ar,
           p.name_en, p.name_ar, p.official_attendance, e.category_meaning,
           e.reason_descriptor_id, e.minutes, e.note
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    join core.class_periods p on p.tenant_id = g.tenant_id and p.id = g.class_period_id
    where e.tenant_id = ${input.tenantId}::uuid and e.student_user_id = ${input.studentId}::uuid
      and e.taken_on between ${input.from}::date and ${input.to}::date and e.status = 'active'
      and e.category_meaning <> 'present'
    order by e.taken_on desc, p.sequence
    limit 200`);
  return {
    counts: counts ?? {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      left_early: 0,
    },
    marks: rows.map((row) => ({
      id: row.id,
      date: row.taken_on,
      classCode: row.code,
      classTitleEn: row.title_en,
      classTitleAr: row.title_ar,
      periodNameEn: row.name_en,
      periodNameAr: row.name_ar,
      official: row.official_attendance,
      meaning: row.category_meaning,
      reasonId: row.reason_descriptor_id,
      minutes: row.minutes,
      note: row.note,
    })),
  };
}

export interface CountedRow {
  id: string;
  code: string | null;
  nameEn: string | null;
  nameAr: string | null;
  classTitleEn: string | null;
  classTitleAr: string | null;
  counts: Record<AttendanceMeaning, number>;
  registers: number;
}

/**
 * Daily attendance between two dates, per student or per homeroom, from the
 * registers that count as daily attendance.
 */
export async function attendanceReport(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    yearId: string;
    from: string;
    to: string;
    by: "student" | "class";
    q: string;
  },
): Promise<CountedRow[]> {
  const q = input.q === "" ? null : `%${input.q}%`;
  const rows = await tx.execute<{
    id: string;
    code: string | null;
    name_en: string | null;
    name_ar: string | null;
    class_title_en: string | null;
    class_title_ar: string | null;
    present: number;
    absent: number;
    late: number;
    excused: number;
    left_early: number;
    registers: number;
  }>(
    input.by === "student"
      ? sql`
    select u.id, null as code, u.full_name_en as name_en, u.full_name_ar as name_ar,
           max(c.title_en) as class_title_en, max(c.title_ar) as class_title_ar,
           count(*) filter (where e.category_meaning = 'present')::int as present,
           count(*) filter (where e.category_meaning = 'absent')::int as absent,
           count(*) filter (where e.category_meaning = 'late')::int as late,
           count(*) filter (where e.category_meaning = 'excused')::int as excused,
           count(*) filter (where e.category_meaning = 'left_early')::int as left_early,
           count(distinct g.id)::int as registers
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.class_periods p on p.tenant_id = g.tenant_id and p.id = g.class_period_id
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.student_user_id
    where e.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
      and g.school_year_id = ${input.yearId}::uuid and p.official_attendance
      and e.taken_on between ${input.from}::date and ${input.to}::date and e.status = 'active'
      and (${q}::text is null or u.full_name_en ilike ${q} or u.full_name_ar ilike ${q})
    group by u.id, u.full_name_en, u.full_name_ar
    order by (count(*) filter (where e.category_meaning in ('absent', 'excused')))::numeric
             / greatest(count(*), 1) desc, u.full_name_en, u.id
    limit 1000`
      : sql`
    select c.id, c.code, c.title_en as name_en, c.title_ar as name_ar,
           null as class_title_en, null as class_title_ar,
           count(e.id) filter (where e.category_meaning = 'present')::int as present,
           count(e.id) filter (where e.category_meaning = 'absent')::int as absent,
           count(e.id) filter (where e.category_meaning = 'late')::int as late,
           count(e.id) filter (where e.category_meaning = 'excused')::int as excused,
           count(e.id) filter (where e.category_meaning = 'left_early')::int as left_early,
           count(distinct g.id)::int as registers
    from core.classes c
    left join core.attendance_registers g on g.tenant_id = c.tenant_id and g.class_id = c.id
      and g.status = 'active' and g.taken_on between ${input.from}::date and ${input.to}::date
      and exists (select 1 from core.class_periods p where p.tenant_id = g.tenant_id
                    and p.id = g.class_period_id and p.official_attendance)
    left join core.attendance_events e on e.tenant_id = g.tenant_id and e.taken_on = g.taken_on
      and e.register_id = g.id and e.status = 'active'
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.schoolId}::uuid
      and c.school_year_id = ${input.yearId}::uuid and c.class_type = 'homeroom'
      and c.status = 'active'
      and (${q}::text is null or c.title_en ilike ${q} or c.title_ar ilike ${q} or c.code ilike ${q})
    group by c.id, c.code, c.title_en, c.title_ar
    order by c.code`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    classTitleEn: row.class_title_en,
    classTitleAr: row.class_title_ar,
    counts: {
      present: row.present,
      absent: row.absent,
      late: row.late,
      excused: row.excused,
      left_early: row.left_early,
    },
    registers: row.registers,
  }));
}

/** Each student's marks in one class's registers over its year. */
export async function classAttendance(
  tx: Tx,
  input: { tenantId: string; classId: string; studentIds: readonly string[] },
): Promise<{
  registers: number;
  students: { studentId: string; counts: Record<AttendanceMeaning, number> }[];
}> {
  const [total] = await tx.execute<{ registers: number }>(sql`
    select count(*)::int as registers from core.attendance_registers
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and status = 'active'`);
  if (input.studentIds.length === 0)
    return { registers: total?.registers ?? 0, students: [] };
  const rows = await tx.execute<{
    student_user_id: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
    left_early: number;
  }>(sql`
    select e.student_user_id,
           count(*) filter (where e.category_meaning = 'present')::int as present,
           count(*) filter (where e.category_meaning = 'absent')::int as absent,
           count(*) filter (where e.category_meaning = 'late')::int as late,
           count(*) filter (where e.category_meaning = 'excused')::int as excused,
           count(*) filter (where e.category_meaning = 'left_early')::int as left_early
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    where e.tenant_id = ${input.tenantId}::uuid and g.class_id = ${input.classId}::uuid
      and g.status = 'active' and e.status = 'active'
      and e.student_user_id = any(${uuidArray(input.studentIds)})
    group by e.student_user_id`);
  const byStudent = new Map(rows.map((row) => [row.student_user_id, row]));
  return {
    registers: total?.registers ?? 0,
    students: input.studentIds.map((studentId) => {
      const row = byStudent.get(studentId);
      return {
        studentId,
        counts: {
          present: row?.present ?? 0,
          absent: row?.absent ?? 0,
          late: row?.late ?? 0,
          excused: row?.excused ?? 0,
          left_early: row?.left_early ?? 0,
        },
      };
    }),
  };
}

/**
 * The last day on or after `from` a student was marked in a class or the
 * subject classes it homes, so an enrolment cannot end under a register
 * that already counts them.
 */
export async function lastMarkInClass(
  tx: Tx,
  input: { tenantId: string; studentId: string; classId: string; from: string },
): Promise<string | null> {
  const [row] = await tx.execute<{ last: string | null }>(sql`
    select to_char(max(e.taken_on), 'YYYY-MM-DD') as last
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    where e.tenant_id = ${input.tenantId}::uuid and e.student_user_id = ${input.studentId}::uuid
      and e.taken_on >= ${input.from}::date and e.status = 'active' and g.status = 'active'
      and (c.id = ${input.classId}::uuid or c.homeroom_class_id = ${input.classId}::uuid)`);
  return row?.last ?? null;
}

/** Whether any register of the day still has the student absent without a reason. */
export async function absentUnexplainedOn(
  tx: Tx,
  input: { tenantId: string; studentId: string; day: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ absent: boolean }>(sql`
    select exists (select 1 from core.attendance_events
      where tenant_id = ${input.tenantId}::uuid and student_user_id = ${input.studentId}::uuid
        and taken_on = ${input.day}::date and status = 'active'
        and category_meaning = 'absent' and reason_descriptor_id is null) as absent`);
  return row?.absent ?? false;
}
