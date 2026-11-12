import type {
  DayTimes,
  PeriodKind,
  PeriodPattern,
} from "@faridalms/domain/timetable";

import { DEFAULT_PERIODS, periodChanged } from "@faridalms/domain/timetable";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface YearPeriod extends PeriodPattern {
  id: string;
  version: number;
  code: string;
  sequence: number;
  /** The first day this version of the period holds. */
  from: string;
  /** The day after the last. */
  until: string;
}

const dayTimesOf = (period: Pick<PeriodPattern, "dayTimes">) =>
  sql`${JSON.stringify(
    period.dayTimes.map((entry) => ({
      weekdays: [...new Set(entry.weekdays)].toSorted((a, b) => a - b),
      startTime: entry.startTime,
      endTime: entry.endTime,
    })),
  )}::text::jsonb`;

const days = (weekdays: readonly number[]) =>
  sql`${`{${[...new Set(weekdays)].toSorted((a, b) => a - b).join(",")}}`}::smallint[]`;

/** The periods of a year's day as they stand on a date, in the order of the day. */
export async function periodsInForce(
  tx: Tx,
  input: { tenantId: string; yearId: string; on: string },
): Promise<YearPeriod[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    code: string;
    name_en: string | null;
    name_ar: string | null;
    sequence: number;
    kind: PeriodKind;
    start_time: string | null;
    end_time: string | null;
    official_attendance: boolean;
    weekdays: number[];
    day_times: DayTimes[];
    valid_during: string;
  }>(sql`
    select id, version, code, name_en, name_ar, sequence, kind,
           to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
           official_attendance, weekdays, day_times, valid_during::text as valid_during
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.yearId}::uuid
      and status = 'active' and valid_during @> ${input.on}::date and bell_schedule_id is null
    order by sequence`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      code: row.code,
      nameEn: row.name_en,
      nameAr: row.name_ar,
      sequence: row.sequence,
      kind: row.kind,
      startTime: row.start_time ?? "",
      endTime: row.end_time ?? "",
      official: row.official_attendance,
      weekdays: row.weekdays,
      dayTimes: row.day_times,
      from: range.from,
      until: range.to ?? range.from,
    };
  });
}

/** The days a year's day changes shape on, its first day among them, earliest first. */
export async function periodChangeDays(
  tx: Tx,
  input: { tenantId: string; yearId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ day: string }>(sql`
    select distinct to_char(lower(valid_during), 'YYYY-MM-DD') as day
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.yearId}::uuid
      and status = 'active' and bell_schedule_id is null
    order by day`);
  return rows.map((row) => row.day);
}

interface TargetYear {
  id: string;
  startsOn: string;
  endsBefore: string;
}

/**
 * Gives a year the day another year ends with, under this school, when it
 * has no periods of its own yet. Codes are kept, so the two years' periods
 * read as the same ones.
 */
export async function copyPeriods(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    sourceYearId: string;
    target: TargetYear;
  },
): Promise<number> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.class_periods (tenant_id, org_id, school_year_id, code, name_en, name_ar,
      sequence, kind, start_time, end_time, official_attendance, weekdays, day_times, valid_during)
    select p.tenant_id, ${input.schoolId}::uuid, ${input.target.id}::uuid, p.code, p.name_en, p.name_ar,
      p.sequence, p.kind, p.start_time, p.end_time, p.official_attendance, p.weekdays, p.day_times,
      daterange(${input.target.startsOn}::date, ${input.target.endsBefore}::date, '[)')
    from core.class_periods p
    join core.academic_sessions y on y.tenant_id = p.tenant_id and y.id = p.school_year_id
    where p.tenant_id = ${input.tenantId}::uuid and p.school_year_id = ${input.sourceYearId}::uuid
      and p.status = 'active' and p.valid_during @> (upper(y.span) - 1) and p.bell_schedule_id is null
      and not exists (
        select 1 from core.class_periods t
        where t.tenant_id = ${input.tenantId}::uuid and t.school_year_id = ${input.target.id}::uuid
          and t.status = 'active' and t.bell_schedule_id is null)
    returning id`);
  return rows.length;
}

export type PeriodSource = "kept" | "year" | "group" | "default";

/**
 * Gives a new year a working day: the one its school's nearest year ends
 * with, else the one a school of its group has, else the platform's
 * default. A year that already has periods keeps them.
 */
export async function givePeriods(
  tx: Tx,
  input: { tenantId: string; schoolId: string; target: TargetYear },
): Promise<PeriodSource> {
  const [held] = await tx.execute<{ held: boolean }>(sql`
    select exists (select 1 from core.class_periods
      where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.target.id}::uuid
        and status = 'active' and bell_schedule_id is null) as held`);
  if (held?.held) return "kept";
  const [source] = await tx.execute<{ id: string; own: boolean }>(sql`
    select y.id, y.org_id = ${input.schoolId}::uuid as own
    from core.academic_sessions y
    where y.tenant_id = ${input.tenantId}::uuid and y.type = 'school_year' and y.status = 'active'
      and y.id <> ${input.target.id}::uuid
      and exists (select 1 from core.class_periods p
        where p.tenant_id = y.tenant_id and p.school_year_id = y.id and p.status = 'active'
          and p.bell_schedule_id is null and p.valid_during @> (upper(y.span) - 1))
    order by y.org_id = ${input.schoolId}::uuid desc,
      lower(y.span) < ${input.target.startsOn}::date desc,
      case when lower(y.span) < ${input.target.startsOn}::date then lower(y.span) end desc,
      lower(y.span)
    limit 1`);
  if (source) {
    await copyPeriods(tx, {
      tenantId: input.tenantId,
      schoolId: input.schoolId,
      sourceYearId: source.id,
      target: input.target,
    });
    return source.own ? "year" : "group";
  }
  await tx.execute(sql`
    insert into core.class_periods (tenant_id, org_id, school_year_id, code, name_en, name_ar,
      sequence, kind, start_time, end_time, official_attendance, weekdays, valid_during)
    values ${sql.join(
      DEFAULT_PERIODS.map(
        (
          period,
          index,
        ) => sql`(${input.tenantId}::uuid, ${input.schoolId}::uuid,
          ${input.target.id}::uuid, ${period.code}, ${period.nameEn}, ${period.nameAr}, ${index + 1},
          ${period.kind}, ${period.startTime}::time, ${period.endTime}::time, ${period.official},
          ${days(period.weekdays)},
          daterange(${input.target.startsOn}::date, ${input.target.endsBefore}::date, '[)'))`,
      ),
      sql`, `,
    )}`);
  return "default";
}

// A meeting of a cycle of days falls on any weekday, so only a period
// leaving the day altogether ends it.
const leaves = (keeps: readonly number[]) => sql`(${keeps.length === 0}
  or (exists (select 1 from core.timetables t where t.tenant_id = class_meetings.tenant_id
        and t.id = class_meetings.timetable_id and t.cycle_kind = 'weeks')
      and not ((weekday - 1) % 7 + 1)::smallint = any(${days(keeps.length ? keeps : [0])})))`;

export class PeriodChangeError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type Change = { old: YearPeriod; next: PeriodPattern & { sequence: number } };

/**
 * Replaces the periods in force on `from` with `periods` from that day on.
 * A period that stays as it was keeps its row. One that changes keeps its
 * earlier days as they were: its row ends the day before and a new row
 * carries it on, with its lessons, cover and absences moved onto it. One
 * that started that very day is changed where it stands. A period no longer
 * held ends, and its lessons with it. A register or arranged cover the
 * change would rewrite refuses it, naming the first such day.
 */
export async function replacePeriodsFrom(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    yearId: string;
    yearEndsBefore: string;
    from: string;
    known: readonly { id: string; version: number }[];
    periods: readonly (PeriodPattern & { id?: string })[];
  },
): Promise<{ kept: number; changed: number; added: number; ended: number }> {
  await tx.execute(sql`select app.lock('class_periods')`);
  const current = await periodsInForce(tx, {
    tenantId: input.tenantId,
    yearId: input.yearId,
    on: input.from,
  });
  const known = new Map(input.known.map((row) => [row.id, row.version]));
  const named = input.periods.flatMap((period) =>
    period.id ? [period.id] : [],
  );
  if (
    current.length !== known.size ||
    current.some((row) => known.get(row.id) !== row.version) ||
    named.some((id) => !known.has(id)) ||
    new Set(named).size !== named.length
  )
    throw new PeriodChangeError("conflict.version");

  const ordered = input.periods
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime))
    .map((period, index) => ({ ...period, sequence: index + 1 }));
  const kept: YearPeriod[] = [];
  const split: Change[] = [];
  const inPlace: Change[] = [];
  const removed: YearPeriod[] = [];
  for (const old of current) {
    const next = ordered.find((period) => period.id === old.id);
    if (!next) removed.push(old);
    else if (!periodChanged(old, next) && old.sequence === next.sequence)
      kept.push(old);
    else if (old.from === input.from) inPlace.push({ old, next });
    else split.push({ old, next });
  }
  const added = ordered.filter((period) => !period.id);
  const touched = [
    ...removed.map((row) => row.id),
    ...[...split, ...inPlace].map((change) => change.old.id),
  ];

  const [register] = await tx.execute<{ day: string | null }>(sql`
    select to_char(min(taken_on), 'YYYY-MM-DD') as day from core.attendance_registers
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and class_period_id = any(${uuidArray(touched)}) and taken_on >= ${input.from}::date`);
  if (register?.day)
    throw new PeriodChangeError(`class_period.registers_after:${register.day}`);
  const dropped = [
    ...removed.map((row) => ({ id: row.id, keeps: [] as readonly number[] })),
    ...[...split, ...inPlace].map((change) => ({
      id: change.old.id,
      keeps: change.next.weekdays,
    })),
  ];
  for (const { id, keeps } of dropped) {
    const [cover] = await tx.execute<{ day: string | null }>(sql`
      select to_char(min(day_on), 'YYYY-MM-DD') as day from core.lesson_changes
      where tenant_id = ${input.tenantId}::uuid and status = 'active'
        and class_period_id = ${id}::uuid and day_on >= ${input.from}::date
        and not extract(isodow from day_on)::smallint = any(${days(keeps.length ? keeps : [0])})`);
    if (cover?.day)
      throw new PeriodChangeError(`class_period.cover_after:${cover.day}`);
  }

  const scope = sql`tenant_id = ${input.tenantId}::uuid and status = 'active'`;
  const ends = (id: string) => sql`
    update core.class_periods set valid_during = daterange(lower(valid_during), ${input.from}::date, '[)')
    where ${scope} and id = ${id}::uuid`;
  const endMeetings = async (periodId: string, keeps: readonly number[]) => {
    const others = sql`class_period_id = ${periodId}::uuid and ${leaves(keeps)}`;
    await tx.execute(sql`
      update core.class_meetings set status = 'tobedeleted'
      where ${scope} and ${others} and lower(valid_during) >= ${input.from}::date`);
    await tx.execute(sql`
      update core.class_meetings set valid_during = daterange(lower(valid_during), ${input.from}::date, '[)')
      where ${scope} and ${others} and valid_during @> ${input.from}::date`);
  };

  for (const row of removed) {
    await endMeetings(row.id, []);
    await tx.execute(
      row.from === input.from
        ? sql`update core.class_periods set status = 'tobedeleted' where ${scope} and id = ${row.id}::uuid`
        : ends(row.id),
    );
  }
  for (const { old } of split) await tx.execute(ends(old.id));
  for (const { old } of inPlace)
    await tx.execute(sql`
      update core.class_periods set sequence = sequence + 25
      where ${scope} and id = ${old.id}::uuid`);

  // A bell schedule's own periods keep their codes, so a new period never takes one.
  const codes = new Set(
    (
      await tx.execute<{ code: string }>(sql`
        select code from core.class_periods
        where ${scope} and school_year_id = ${input.yearId}::uuid`)
    ).map((row) => row.code),
  );
  const freshCode = () => {
    let number = 1;
    while (codes.has(`p${number}`)) number += 1;
    codes.add(`p${number}`);
    return `p${number}`;
  };
  const [boundary] = await tx.execute<{ day: string | null }>(sql`
    select to_char(min(lower(valid_during)), 'YYYY-MM-DD') as day from core.class_periods
    where ${scope} and school_year_id = ${input.yearId}::uuid and bell_schedule_id is null
      and lower(valid_during) > ${input.from}::date`);
  const segmentEnd = [
    ...current.map((row) => row.until),
    boundary?.day ?? input.yearEndsBefore,
  ].reduce((a, b) => (a < b ? a : b), input.yearEndsBefore);
  const insert = async (
    period: PeriodPattern & { sequence: number },
    code: string,
    until: string,
  ) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into core.class_periods (tenant_id, org_id, school_year_id, code, name_en, name_ar,
        sequence, kind, start_time, end_time, official_attendance, weekdays, day_times, valid_during)
      values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.yearId}::uuid, ${code},
        ${period.nameEn}, ${period.nameAr}, ${period.sequence}, ${period.kind},
        ${period.startTime}::time, ${period.endTime}::time, ${period.official},
        ${days(period.weekdays)}, ${dayTimesOf(period)},
        daterange(${input.from}::date, ${until}::date, '[)'))
      returning id`);
    if (!row) throw new Error("period not written");
    return row.id;
  };

  for (const { old, next } of split) {
    const id = await insert(next, old.code, old.until);
    const keeps = days(next.weekdays);
    await endMeetings(old.id, next.weekdays);
    await tx.execute(sql`
      update core.class_meetings set class_period_id = ${id}::uuid
      where ${scope} and class_period_id = ${old.id}::uuid
        and lower(valid_during) >= ${input.from}::date`);
    await tx.execute(sql`
      with spanning as (
        select id, upper(valid_during) as until from core.class_meetings
        where ${scope} and class_period_id = ${old.id}::uuid
          and valid_during @> ${input.from}::date and lower(valid_during) < ${input.from}::date
      ), ended as (
        update core.class_meetings m
        set valid_during = daterange(lower(m.valid_during), ${input.from}::date, '[)')
        from spanning s
        where m.tenant_id = ${input.tenantId}::uuid and m.id = s.id
        returning m.tenant_id, m.org_id, m.class_id, m.school_year_id,
          m.timetable_id, m.weekday, m.teacher_user_id, m.location_id,
          m.clash_accepted, s.until
      )
      insert into core.class_meetings (tenant_id, org_id, class_id, school_year_id,
        timetable_id, weekday, class_period_id, teacher_user_id, location_id,
        valid_during, clash_accepted)
      select e.tenant_id, e.org_id, e.class_id, e.school_year_id, e.timetable_id,
        e.weekday, ${id}::uuid, e.teacher_user_id, e.location_id,
        daterange(${input.from}::date, e.until, '[)'), e.clash_accepted
      from ended e
      join core.timetables t on t.tenant_id = e.tenant_id and t.id = e.timetable_id
      where t.cycle_kind = 'days' or ((e.weekday - 1) % 7 + 1)::smallint = any(${keeps})`);
    await tx.execute(sql`
      update core.lesson_changes set class_period_id = ${id}::uuid
      where ${scope} and class_period_id = ${old.id}::uuid and day_on >= ${input.from}::date`);
    await tx.execute(sql`
      update core.staff_absences set period_ids = array_append(period_ids, ${id}::uuid)
      where ${scope} and ${old.id}::uuid = any(period_ids) and upper(span) > ${input.from}::date`);
  }
  for (const { old, next } of inPlace) {
    await endMeetings(old.id, next.weekdays);
    await tx.execute(sql`
      update core.class_periods
      set name_en = ${next.nameEn}, name_ar = ${next.nameAr}, sequence = ${next.sequence},
          kind = ${next.kind}, start_time = ${next.startTime}::time, end_time = ${next.endTime}::time,
          official_attendance = ${next.official}, weekdays = ${days(next.weekdays)},
          day_times = ${dayTimesOf(next)}
      where ${scope} and id = ${old.id}::uuid`);
  }
  for (const period of added) await insert(period, freshCode(), segmentEnd);
  return {
    kept: kept.length,
    changed: split.length + inPlace.length,
    added: added.length,
    ended: removed.length,
  };
}
