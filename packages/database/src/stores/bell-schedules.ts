import type {
  BellTimes,
  ExtraPeriodInput,
  PeriodKind,
} from "@faridalms/domain/timetable";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

/**
 * A change the schedule refuses: a stale version, a code the school's own
 * periods use, or a period of its own still in use, followed by the first
 * day a one-day lesson or another module's record holds it.
 */
export class BellScheduleConflict extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface ScheduleFields {
  nameEn: string | null;
  nameAr: string | null;
  times: readonly BellTimes[];
}

const timesOf = (times: readonly BellTimes[]) =>
  sql`${JSON.stringify(
    times
      .map((row) => ({
        code: row.code,
        startTime: row.startTime,
        endTime: row.endTime,
      }))
      .toSorted((a, b) => a.startTime.localeCompare(b.startTime)),
  )}::text::jsonb`;

export async function insertBellSchedule(
  tx: Tx,
  input: ScheduleFields & {
    tenantId: string;
    schoolId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.bell_schedules (tenant_id, org_id, name_en, name_ar, times)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid,
      ${input.nameEn}, ${input.nameAr}, ${timesOf(input.times)})
    returning id`);
  if (!row) throw new Error("bell schedule not written");
  return row.id;
}

export async function updateBellSchedule(
  tx: Tx,
  input: ScheduleFields & {
    tenantId: string;
    schoolId: string;
    id: string;
    version: number;
  },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.bell_schedules
    set name_en = ${input.nameEn}, name_ar = ${input.nameAr}, times = ${timesOf(input.times)}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and org_id = ${input.schoolId}::uuid and status = 'active'
      and version = ${input.version}
    returning id`);
  if (rows.length === 0) throw new BellScheduleConflict("conflict.version");
}

/** A period only a bell schedule's days hold, at its own times. */
export interface ExtraPeriod {
  id: string;
  scheduleId: string;
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  kind: PeriodKind;
  startTime: string;
  endTime: string;
}

/** The periods of their own the given bell schedules add to their days. */
export async function extraPeriodsOf(
  tx: Tx,
  input: { tenantId: string; scheduleIds: readonly string[] },
): Promise<ExtraPeriod[]> {
  if (input.scheduleIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    bell_schedule_id: string;
    code: string;
    name_en: string | null;
    name_ar: string | null;
    kind: PeriodKind;
    start_time: string;
    end_time: string;
  }>(sql`
    select id, bell_schedule_id, code, name_en, name_ar, kind,
           to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and bell_schedule_id = any(${uuidArray(input.scheduleIds)})
    order by start_time, code`);
  return rows.map((row) => ({
    id: row.id,
    scheduleId: row.bell_schedule_id,
    code: row.code,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    kind: row.kind,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

/** The first day on or after a date, or any day for null, another module used one of these periods on. */
export type FirstUse = (
  periodIds: readonly string[],
  from: string | null,
) => Promise<string | null>;

/** Refuses when a one-day lesson, or what another module keeps, holds any of the periods. */
async function refuseInUse(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
  firstUse: FirstUse,
) {
  if (ids.length === 0) return;
  const [row] = await tx.execute<{ day: string | null }>(sql`
    select to_char(min(day_on), 'YYYY-MM-DD') as day from core.lesson_changes
    where tenant_id = ${tenantId}::uuid and status = 'active'
      and class_period_id = any(${uuidArray(ids)})`);
  const used = await firstUse(ids, null);
  const day = [row?.day ?? null, used]
    .flatMap((one) => (one === null ? [] : [one]))
    .toSorted()[0];
  if (day) throw new BellScheduleConflict(`bell_schedule.period_in_use:${day}`);
}

async function endExtras(tx: Tx, tenantId: string, ids: readonly string[]) {
  if (ids.length === 0) return;
  await tx.execute(sql`
    update core.class_periods set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and status = 'active' and id = any(${uuidArray(ids)})`);
}

/**
 * Gives a bell schedule its own periods: those named by id change where
 * they stand, new ones are added, held on every day of the schedule, and
 * one no longer given ends, refused while a register or one-day lesson
 * holds it. A code the school's own periods use is refused, so a day never
 * holds two.
 */
export async function setExtraPeriods(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    scheduleId: string;
    times: readonly BellTimes[];
    extras: readonly ExtraPeriodInput[];
    firstUse: FirstUse;
  },
): Promise<{ added: number; changed: number; ended: number }> {
  const current = await extraPeriodsOf(tx, {
    tenantId: input.tenantId,
    scheduleIds: [input.scheduleId],
  });
  const known = new Set(current.map((row) => row.id));
  if (input.extras.some((row) => row.id && !known.has(row.id)))
    throw new BellScheduleConflict("conflict.version");
  const [taken] = await tx.execute<{ code: string }>(sql`
    select code from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active' and bell_schedule_id is null
      and code = any(${textArray(input.extras.map((row) => row.code))})
    limit 1`);
  if (taken) throw new BellScheduleConflict("bell_schedule.code_taken");

  const kept = new Set(input.extras.flatMap((row) => (row.id ? [row.id] : [])));
  const ended = current.filter((row) => !kept.has(row.id));
  await refuseInUse(
    tx,
    input.tenantId,
    ended.map((row) => row.id),
    input.firstUse,
  );
  await endExtras(
    tx,
    input.tenantId,
    ended.map((row) => row.id),
  );

  const order = [...input.times, ...input.extras]
    .map((row) => row.startTime)
    .toSorted();
  const sequenceOf = (startTime: string) =>
    Math.min(order.indexOf(startTime) + 1, 50);
  let changed = 0;
  let added = 0;
  for (const extra of input.extras) {
    const before = current.find((row) => row.id === extra.id);
    if (before) {
      if (
        before.code === extra.code &&
        before.nameEn === extra.nameEn &&
        before.nameAr === extra.nameAr &&
        before.kind === extra.kind &&
        before.startTime === extra.startTime &&
        before.endTime === extra.endTime
      )
        continue;
      await tx.execute(sql`
        update core.class_periods
        set code = ${extra.code}, name_en = ${extra.nameEn}, name_ar = ${extra.nameAr},
            kind = ${extra.kind}, sequence = ${sequenceOf(extra.startTime)},
            start_time = ${extra.startTime}::time, end_time = ${extra.endTime}::time
        where tenant_id = ${input.tenantId}::uuid and id = ${before.id}::uuid and status = 'active'`);
      changed += 1;
      continue;
    }
    await tx.execute(sql`
      insert into core.class_periods (tenant_id, org_id, code, name_en, name_ar,
        sequence, kind, start_time, end_time, official_attendance, valid_during, bell_schedule_id)
      values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${extra.code},
        ${extra.nameEn}, ${extra.nameAr}, ${sequenceOf(extra.startTime)}, ${extra.kind},
        ${extra.startTime}::time, ${extra.endTime}::time, false,
        '(,)'::daterange, ${input.scheduleId}::uuid)`);
    added += 1;
  }
  return { added, changed, ended: ended.length };
}

/**
 * Removes a bell schedule and its own periods, refused while a register or
 * one-day lesson holds one of them; the days that ran on it go back to
 * their own times.
 */
export async function removeBellSchedule(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    id: string;
    version: number;
    firstUse: FirstUse;
  },
): Promise<{ days: number }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    update core.bell_schedules set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and id = ${input.id}::uuid and status = 'active' and version = ${input.version}
    returning id`);
  if (!row) throw new BellScheduleConflict("conflict.version");
  const extras = await extraPeriodsOf(tx, {
    tenantId: input.tenantId,
    scheduleIds: [input.id],
  });
  await refuseInUse(
    tx,
    input.tenantId,
    extras.map((extra) => extra.id),
    input.firstUse,
  );
  await endExtras(
    tx,
    input.tenantId,
    extras.map((extra) => extra.id),
  );
  const scope = sql`tenant_id = ${input.tenantId}::uuid and bell_schedule_id = ${input.id}::uuid
    and status = 'active'`;
  const ended = await tx.execute<{ id: string }>(sql`
    update core.timetable_days set status = 'tobedeleted'
    where ${scope} and runs_as is null
    returning id`);
  const kept = await tx.execute<{ id: string }>(sql`
    update core.timetable_days set bell_schedule_id = null
    where ${scope} and runs_as is not null
    returning id`);
  return { days: ended.length + kept.length };
}

/** How the timetable runs a school's dates: their bell schedules and the cycle days they run as. */
export interface TimetableDay {
  day: string;
  scheduleId: string | null;
  runsAs: number | null;
}

export async function timetableDays(
  tx: Tx,
  input: { tenantId: string; schoolId: string; from: string; to: string },
): Promise<TimetableDay[]> {
  const rows = await tx.execute<{
    day: string;
    bell_schedule_id: string | null;
    runs_as: number | null;
  }>(sql`
    select to_char(day_on, 'YYYY-MM-DD') as day, bell_schedule_id, runs_as
    from core.timetable_days
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active' and day_on between ${input.from}::date and ${input.to}::date
    order by day_on`);
  return rows.map((row) => ({
    day: row.day,
    scheduleId: row.bell_schedule_id,
    runsAs: row.runs_as,
  }));
}

/** The days on or before `to` that run as another day of the cycle. */
export async function runsAsDays(
  tx: Tx,
  input: { tenantId: string; schoolId: string; to: string },
): Promise<Map<string, number>> {
  const rows = await tx.execute<{ day: string; runs_as: number }>(sql`
    select to_char(day_on, 'YYYY-MM-DD') as day, runs_as from core.timetable_days
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active' and runs_as is not null and day_on <= ${input.to}::date`);
  return new Map(rows.map((row) => [row.day, row.runs_as]));
}

/**
 * Sets what the timetable runs each of `days` with, leaving the other
 * setting of each day as it was; a day left with neither has no row.
 * Returns how many days changed.
 */
async function setDays(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    days: readonly string[];
    set: { scheduleId: string | null } | { runsAs: number | null };
  },
): Promise<number> {
  if (input.days.length === 0) return 0;
  await tx.execute(sql`select app.lock(${`timetable_days:${input.schoolId}`})`);
  const current = new Map(
    (
      await timetableDays(tx, {
        tenantId: input.tenantId,
        schoolId: input.schoolId,
        from: input.days.reduce((a, b) => (a < b ? a : b)),
        to: input.days.reduce((a, b) => (a > b ? a : b)),
      })
    ).map((row) => [row.day, row]),
  );
  let changed = 0;
  for (const day of input.days) {
    const before = current.get(day) ?? { day, scheduleId: null, runsAs: null };
    const after = { ...before, ...input.set };
    if (
      after.scheduleId === before.scheduleId &&
      after.runsAs === before.runsAs
    )
      continue;
    changed += 1;
    const where = sql`tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and day_on = ${day}::date and status = 'active'`;
    if (current.has(day) && after.scheduleId === null && after.runsAs === null)
      await tx.execute(sql`
        update core.timetable_days set status = 'tobedeleted' where ${where}`);
    else if (current.has(day))
      await tx.execute(sql`
        update core.timetable_days
        set bell_schedule_id = ${after.scheduleId}::uuid, runs_as = ${after.runsAs}::smallint
        where ${where}`);
    else
      await tx.execute(sql`
        insert into core.timetable_days (tenant_id, org_id, day_on, bell_schedule_id, runs_as)
        values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${day}::date,
          ${after.scheduleId}::uuid, ${after.runsAs}::smallint)`);
  }
  return changed;
}

/** Runs these days on a bell schedule, or on their own times when none is given. */
export const scheduleDays = (
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    days: readonly string[];
    scheduleId: string | null;
  },
) => setDays(tx, { ...input, set: { scheduleId: input.scheduleId } });

/**
 * Runs one day as another day of its timetable's cycle, or as its own with
 * null, returning what it ran as before.
 */
export async function runDayAs(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    day: string;
    runsAs: number | null;
  },
): Promise<{ before: number | null }> {
  const [current] = await timetableDays(tx, {
    ...input,
    from: input.day,
    to: input.day,
  });
  await setDays(tx, {
    ...input,
    days: [input.day],
    set: { runsAs: input.runsAs },
  });
  return { before: current?.runsAs ?? null };
}
