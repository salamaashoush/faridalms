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
 * A change the schedule refuses: a stale version, a code the year's own
 * periods use, or a period of its own still in use, followed by the first
 * day a register or a one-day lesson holds it.
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
    yearId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.bell_schedules (tenant_id, org_id, school_year_id, name_en, name_ar, times)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.yearId}::uuid,
      ${input.nameEn}, ${input.nameAr}, ${timesOf(input.times)})
    returning id`);
  if (!row) throw new Error("bell schedule not written");
  return row.id;
}

export async function updateBellSchedule(
  tx: Tx,
  input: ScheduleFields & {
    tenantId: string;
    yearId: string;
    id: string;
    version: number;
  },
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.bell_schedules
    set name_en = ${input.nameEn}, name_ar = ${input.nameAr}, times = ${timesOf(input.times)}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and school_year_id = ${input.yearId}::uuid and status = 'active'
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

/** Refuses when a register or one-day lesson holds any of the periods. */
async function refuseInUse(tx: Tx, tenantId: string, ids: readonly string[]) {
  if (ids.length === 0) return;
  const [row] = await tx.execute<{ day: string | null }>(sql`
    select to_char(min(day), 'YYYY-MM-DD') as day from (
      select taken_on as day from core.attendance_registers
      where tenant_id = ${tenantId}::uuid and status = 'active'
        and class_period_id = any(${uuidArray(ids)})
      union all
      select day_on from core.lesson_changes
      where tenant_id = ${tenantId}::uuid and status = 'active'
        and class_period_id = any(${uuidArray(ids)})
    ) held`);
  if (row?.day)
    throw new BellScheduleConflict(`bell_schedule.period_in_use:${row.day}`);
}

async function endExtras(tx: Tx, tenantId: string, ids: readonly string[]) {
  if (ids.length === 0) return;
  await tx.execute(sql`
    update core.class_periods set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and status = 'active' and id = any(${uuidArray(ids)})`);
}

/**
 * Gives a bell schedule its own periods: those named by id change where
 * they stand, new ones are added for the whole year, and one no longer
 * given ends, refused while a register or one-day lesson holds it. A code
 * the year's own periods use is refused, so a day never holds two.
 */
export async function setExtraPeriods(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    year: { id: string; startsOn: string; endsBefore: string };
    scheduleId: string;
    times: readonly BellTimes[];
    extras: readonly ExtraPeriodInput[];
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
    where tenant_id = ${input.tenantId}::uuid and school_year_id = ${input.year.id}::uuid
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
      insert into core.class_periods (tenant_id, org_id, school_year_id, code, name_en, name_ar,
        sequence, kind, start_time, end_time, official_attendance, valid_during, bell_schedule_id)
      values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.year.id}::uuid, ${extra.code},
        ${extra.nameEn}, ${extra.nameAr}, ${sequenceOf(extra.startTime)}, ${extra.kind},
        ${extra.startTime}::time, ${extra.endTime}::time, false,
        daterange(${input.year.startsOn}::date, ${input.year.endsBefore}::date, '[)'),
        ${input.scheduleId}::uuid)`);
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
  input: { tenantId: string; id: string; version: number },
): Promise<{ yearId: string; days: number }> {
  const [row] = await tx.execute<{ school_year_id: string }>(sql`
    update core.bell_schedules set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and version = ${input.version}
    returning school_year_id`);
  if (!row) throw new BellScheduleConflict("conflict.version");
  const extras = await extraPeriodsOf(tx, {
    tenantId: input.tenantId,
    scheduleIds: [input.id],
  });
  await refuseInUse(
    tx,
    input.tenantId,
    extras.map((extra) => extra.id),
  );
  await endExtras(
    tx,
    input.tenantId,
    extras.map((extra) => extra.id),
  );
  const days = await tx.execute<{ id: string }>(sql`
    update core.calendar_dates set bell_schedule_id = null
    where tenant_id = ${input.tenantId}::uuid and bell_schedule_id = ${input.id}::uuid
    returning id`);
  return { yearId: row.school_year_id, days: days.length };
}

/**
 * Runs the days in `[from, to]` on a bell schedule, or on their own times
 * when none is given. Weekends are left as they are, as marking days does.
 */
export async function scheduleDays(
  tx: Tx,
  input: {
    tenantId: string;
    yearId: string;
    from: string;
    to: string;
    scheduleId: string | null;
  },
): Promise<number> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.calendar_dates d
    set bell_schedule_id = ${input.scheduleId}::uuid
    from core.calendars c, core.descriptors e
    where d.tenant_id = ${input.tenantId}::uuid and d.school_year_id = ${input.yearId}::uuid
      and d.status = 'active' and d.day_on between ${input.from}::date and ${input.to}::date
      and c.tenant_id = d.tenant_id and c.id = d.calendar_id and c.kind = 'school' and c.status = 'active'
      and e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id and e.system_meaning <> 'weekend'
      and d.bell_schedule_id is distinct from ${input.scheduleId}::uuid
    returning d.id`);
  return rows.length;
}
