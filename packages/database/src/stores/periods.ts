import type {
  DayTimes,
  PeriodKind,
  PeriodPattern,
} from "@faridalms/domain/timetable";

import { periodChanged } from "@faridalms/domain/timetable";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { bounds } from "./sql";

type Tx = CellTransaction;

export interface SchoolPeriod extends PeriodPattern {
  id: string;
  version: number;
  code: string;
  sequence: number;
  /** The first day this version of the period holds. */
  from: string;
  /** The day after the last, or null while it runs on. */
  until: string | null;
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

/** The periods of the school's day as they stand on a date, in the order of the day. */
export async function periodsInForce(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
): Promise<SchoolPeriod[]> {
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
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
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
      until: range.to,
    };
  });
}

/** The days the school's day changes shape on, its first day among them, earliest first. */
export async function periodChangeDays(
  tx: Tx,
  input: { tenantId: string; schoolId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ day: string }>(sql`
    select distinct to_char(lower(valid_during), 'YYYY-MM-DD') as day
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active' and bell_schedule_id is null
    order by day`);
  return rows.map((row) => row.day);
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

type Change = { old: SchoolPeriod; next: PeriodPattern & { sequence: number } };

/**
 * Replaces the periods in force on `from` with `periods` from that day on.
 * A period that stays as it was keeps its row. One that changes keeps its
 * earlier days as they were: its row ends the day before and a new row
 * carries it on, with its lessons, cover and absences moved onto it. One
 * that started that very day is changed where it stands. A period no longer
 * held ends, and its lessons with it. What another module took in a period
 * from that day (a register), or arranged cover, the change would rewrite
 * refuses it, naming the first such day.
 */
export async function replacePeriodsFrom(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    from: string;
    known: readonly { id: string; version: number }[];
    periods: readonly (PeriodPattern & { id?: string })[];
    /** The first day on or after a date another module used one of these periods on, which the change refuses. */
    firstUse: (
      periodIds: readonly string[],
      from: string,
    ) => Promise<string | null>;
  },
): Promise<{ kept: number; changed: number; added: number; ended: number }> {
  await tx.execute(sql`select app.lock('class_periods')`);
  const current = await periodsInForce(tx, {
    tenantId: input.tenantId,
    schoolId: input.schoolId,
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
  const kept: SchoolPeriod[] = [];
  const split: Change[] = [];
  const inPlace: Change[] = [];
  const removed: SchoolPeriod[] = [];
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

  const used = await input.firstUse(touched, input.from);
  if (used) throw new PeriodChangeError(`class_period.registers_after:${used}`);
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
  const school = sql`${scope} and org_id = ${input.schoolId}::uuid`;
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
        select code from core.class_periods where ${school}`)
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
    where ${school} and bell_schedule_id is null
      and lower(valid_during) > ${input.from}::date`);
  const segmentEnd = [
    ...current.map((row) => row.until),
    boundary?.day ?? null,
  ].reduce<string | null>(
    (a, b) => (a === null ? b : b === null ? a : a < b ? a : b),
    null,
  );
  const insert = async (
    period: PeriodPattern & { sequence: number },
    code: string,
    until: string | null,
  ) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into core.class_periods (tenant_id, org_id, code, name_en, name_ar,
        sequence, kind, start_time, end_time, official_attendance, weekdays, day_times, valid_during)
      values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${code},
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
        returning m.tenant_id, m.org_id, m.class_id,
          m.timetable_id, m.weekday, m.teacher_user_id, m.location_id,
          m.clash_accepted, s.until
      )
      insert into core.class_meetings (tenant_id, org_id, class_id,
        timetable_id, weekday, class_period_id, teacher_user_id, location_id,
        valid_during, clash_accepted)
      select e.tenant_id, e.org_id, e.class_id, e.timetable_id,
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
