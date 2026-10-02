import type { StaffAbsenceReason } from "@faridalms/domain/timetable";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { bounds, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface StaffAbsence {
  id: string;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  from: string;
  /** The last day away, inclusive. */
  to: string;
  periodIds: string[] | null;
  reason: StaffAbsenceReason;
  note: string | null;
}

/** Staff away on some day from `from` to `to`, inclusive. */
export async function absencesBetween(
  tx: Tx,
  input: { tenantId: string; schoolId: string; from: string; to: string },
): Promise<StaffAbsence[]> {
  const rows = await tx.execute<{
    id: string;
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    span: string;
    period_ids: string[] | null;
    reason: StaffAbsenceReason;
    note: string | null;
  }>(sql`
    select a.id, a.user_id, u.full_name_en, u.full_name_ar, a.span::text as span,
           a.period_ids, a.reason, a.note
    from core.staff_absences a
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.user_id
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.schoolId}::uuid
      and a.status = 'active'
      and a.span && daterange(${input.from}::date, ${input.to}::date, '[]')
    order by u.full_name_en, lower(a.span)`);
  return rows.map((row) => {
    const span = bounds(row.span);
    const end = new Date(`${span.to ?? span.from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    return {
      id: row.id,
      userId: row.user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      from: span.from,
      to: end.toISOString().slice(0, 10),
      periodIds: row.period_ids,
      reason: row.reason,
      note: row.note,
    };
  });
}

/** Whether an absence keeps its teacher from a period of a day. */
export function awayAt(
  absences: readonly StaffAbsence[],
  userId: string,
  day: string,
  periodId: string,
): boolean {
  return absences.some(
    (absence) =>
      absence.userId === userId &&
      absence.from <= day &&
      day <= absence.to &&
      (absence.periodIds === null || absence.periodIds.includes(periodId)),
  );
}

export async function insertAbsence(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    yearId: string;
    userId: string;
    from: string;
    to: string;
    periodIds: readonly string[] | null;
    reason: StaffAbsenceReason;
    note: string | null;
  },
): Promise<string> {
  const periods = input.periodIds ? uuidArray(input.periodIds) : sql`null`;
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.staff_absences
      (tenant_id, org_id, school_year_id, user_id, span, period_ids, reason, note)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.yearId}::uuid,
      ${input.userId}::uuid, daterange(${input.from}::date, ${input.to}::date, '[]'),
      ${periods}, ${input.reason}, ${input.note})
    returning id`);
  if (!row) throw new Error("staff absence not inserted");
  return row.id;
}

/** Ends an absence; the lessons already covered keep their cover. */
export async function removeAbsence(
  tx: Tx,
  input: { tenantId: string; schoolId: string; id: string },
): Promise<{ userId: string } | null> {
  const [row] = await tx.execute<{ user_id: string }>(sql`
    update core.staff_absences set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning user_id`);
  return row ? { userId: row.user_id } : null;
}

export interface LessonChange {
  id: string;
  classId: string;
  periodId: string;
  day: string;
  coverId: string | null;
  coverNameEn: string | null;
  coverNameAr: string | null;
  roomId: string | null;
  roomCode: string | null;
  roomNameEn: string | null;
  roomNameAr: string | null;
  cancelled: boolean;
  note: string | null;
}

type ChangeFilter =
  | { schoolId: string }
  | { coverId: string }
  | { classIds: readonly string[] };

/** One-day changes to lessons on the given days. */
export async function changesOn(
  tx: Tx,
  input: { tenantId: string; days: readonly string[]; filter: ChangeFilter },
): Promise<LessonChange[]> {
  if (input.days.length === 0) return [];
  const filter =
    "schoolId" in input.filter
      ? sql`x.org_id = ${input.filter.schoolId}::uuid`
      : "coverId" in input.filter
        ? sql`x.cover_user_id = ${input.filter.coverId}::uuid`
        : sql`x.class_id = any(${uuidArray(input.filter.classIds)})`;
  const rows = await tx.execute<{
    id: string;
    class_id: string;
    class_period_id: string;
    day: string;
    cover_user_id: string | null;
    cover_en: string | null;
    cover_ar: string | null;
    location_id: string | null;
    room_code: string | null;
    room_en: string | null;
    room_ar: string | null;
    cancelled: boolean;
    note: string | null;
  }>(sql`
    select x.id, x.class_id, x.class_period_id, to_char(x.day_on, 'YYYY-MM-DD') as day,
           x.cover_user_id, u.full_name_en as cover_en, u.full_name_ar as cover_ar,
           x.location_id, l.code as room_code, l.name_en as room_en, l.name_ar as room_ar,
           x.cancelled, x.note
    from core.lesson_changes x
    left join core.users u on u.tenant_id = x.tenant_id and u.id = x.cover_user_id
    left join core.locations l on l.tenant_id = x.tenant_id and l.id = x.location_id
    where x.tenant_id = ${input.tenantId}::uuid and x.status = 'active'
      and x.day_on = any(${textArray(input.days)}::date[]) and ${filter}`);
  return rows.map((row) => ({
    id: row.id,
    classId: row.class_id,
    periodId: row.class_period_id,
    day: row.day,
    coverId: row.cover_user_id,
    coverNameEn: row.cover_en,
    coverNameAr: row.cover_ar,
    roomId: row.location_id,
    roomCode: row.room_code,
    roomNameEn: row.room_en,
    roomNameAr: row.room_ar,
    cancelled: row.cancelled,
    note: row.note,
  }));
}

export interface ChangeKey {
  tenantId: string;
  classId: string;
  periodId: string;
  day: string;
}

/**
 * Sets a lesson's change for a day, replacing any before it, and returns who
 * covered it before so they can be told.
 */
export async function setChange(
  tx: Tx,
  input: ChangeKey & {
    schoolId: string;
    yearId: string;
    coverId: string | null;
    roomId: string | null;
    cancelled: boolean;
    note: string | null;
  },
): Promise<{ previousCoverId: string | null }> {
  const previous = await clearChange(tx, input);
  await tx.execute(sql`
    insert into core.lesson_changes
      (tenant_id, org_id, school_year_id, class_id, class_period_id, day_on,
       cover_user_id, location_id, cancelled, note)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.yearId}::uuid,
      ${input.classId}::uuid, ${input.periodId}::uuid, ${input.day}::date,
      ${input.coverId}::uuid, ${input.roomId}::uuid, ${input.cancelled}, ${input.note})`);
  return previous;
}

/** Puts a lesson back as the timetable has it, returning who covered it. */
export async function clearChange(
  tx: Tx,
  input: ChangeKey,
): Promise<{ previousCoverId: string | null }> {
  const [row] = await tx.execute<{ cover_user_id: string | null }>(sql`
    update core.lesson_changes set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and class_period_id = ${input.periodId}::uuid and day_on = ${input.day}::date
      and status = 'active'
    returning cover_user_id`);
  return { previousCoverId: row?.cover_user_id ?? null };
}

/** The periods in which someone covers a class on a day. */
export async function coveredPeriods(
  tx: Tx,
  input: { tenantId: string; userId: string; classId: string; day: string },
): Promise<string[]> {
  const rows = await tx.execute<{ class_period_id: string }>(sql`
    select class_period_id from core.lesson_changes
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and cover_user_id = ${input.userId}::uuid and class_id = ${input.classId}::uuid
      and day_on = ${input.day}::date`);
  return rows.map((row) => row.class_period_id);
}

export interface CoverCandidate {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  /** Teaches or assists the class on that day. */
  knowsClass: boolean;
  /** Teaches another class of the same subject this year. */
  sameSubject: boolean;
  /** Lessons they have covered this year so far. */
  covers: number;
  /** Their own lessons and covers on the day. */
  lessonsThatDay: number;
}

/**
 * Who could cover a lesson: staff teaching this year who are neither
 * timetabled nor already covering in that period. Absence is left to the
 * caller, which knows the day's absences. Those who know the class come
 * first, then the subject, then whoever has covered least.
 */
export async function coverCandidates(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    yearId: string;
    classId: string;
    periodId: string;
    day: string;
  },
): Promise<CoverCandidate[]> {
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    knows_class: boolean;
    same_subject: boolean;
    covers: number;
    lessons: number;
  }>(sql`
    with staff as (
      select distinct e.user_id from core.enrollments e
      where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.schoolId}::uuid
        and e.school_year_id = ${input.yearId}::uuid and e.status = 'active'
        and e.role in ('teacher', 'aide')
    ),
    teaching as (
      select m.teacher_user_id as user_id, m.class_id, m.class_period_id
      from core.class_meetings m
      where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
        and m.status = 'active' and m.teacher_user_id is not null
        and m.valid_during @> ${input.day}::date
        and m.weekday = extract(isodow from ${input.day}::date)
        and not exists (select 1 from core.lesson_changes x
          where x.tenant_id = m.tenant_id and x.status = 'active' and x.class_id = m.class_id
            and x.class_period_id = m.class_period_id and x.day_on = ${input.day}::date
            and (x.cancelled or x.cover_user_id is not null))
      union all
      select x.cover_user_id, x.class_id, x.class_period_id from core.lesson_changes x
      where x.tenant_id = ${input.tenantId}::uuid and x.org_id = ${input.schoolId}::uuid
        and x.status = 'active' and x.day_on = ${input.day}::date and x.cover_user_id is not null
    ),
    lesson as (
      select c.subject_descriptor_id from core.classes c
      where c.tenant_id = ${input.tenantId}::uuid and c.id = ${input.classId}::uuid
    )
    select u.id, u.full_name_en, u.full_name_ar,
      exists (select 1 from core.enrollments e
        where e.tenant_id = u.tenant_id and e.user_id = u.id and e.status = 'active'
          and e.role in ('teacher', 'aide') and e.valid_during @> ${input.day}::date
          and e.class_id in (${input.classId}::uuid, coalesce((select c.homeroom_class_id
            from core.classes c where c.tenant_id = u.tenant_id and c.id = ${input.classId}::uuid),
            ${input.classId}::uuid))) as knows_class,
      exists (select 1 from core.enrollments e
        join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
        where e.tenant_id = u.tenant_id and e.user_id = u.id and e.status = 'active'
          and e.role in ('teacher', 'aide') and e.school_year_id = ${input.yearId}::uuid
          and c.subject_descriptor_id is not null
          and c.subject_descriptor_id = (select subject_descriptor_id from lesson)) as same_subject,
      (select count(*)::int from core.lesson_changes x
        where x.tenant_id = u.tenant_id and x.status = 'active' and x.cover_user_id = u.id
          and x.school_year_id = ${input.yearId}::uuid) as covers,
      (select count(*)::int from teaching t where t.user_id = u.id) as lessons
    from staff s
    join core.users u on u.tenant_id = ${input.tenantId}::uuid and u.id = s.user_id
    where not exists (select 1 from teaching t
      where t.user_id = u.id and t.class_period_id = ${input.periodId}::uuid)
    order by knows_class desc, same_subject desc, covers, lessons, u.full_name_en`);
  return rows.map((row) => ({
    userId: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    knowsClass: row.knows_class,
    sameSubject: row.same_subject,
    covers: row.covers,
    lessonsThatDay: row.lessons,
  }));
}
