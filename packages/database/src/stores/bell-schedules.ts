import type { BellTimes } from "@faridalms/domain/timetable";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export class BellScheduleConflict extends Error {
  constructor(readonly code: "conflict.version") {
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

/** Removes a bell schedule; the days that ran on it go back to their own times. */
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
