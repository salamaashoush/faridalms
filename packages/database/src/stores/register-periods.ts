import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { DayPlan } from "./day-plan";

import { heldOn } from "./day-plan";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** The period a register was taken in, at its own times. */
export interface TakenPeriod {
  id: string;
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  sequence: number;
  kind: "lesson" | "registration";
  startTime: string | null;
  endTime: string | null;
  official: boolean;
}

/** The register a class has in a period of a day, or null. */
export async function periodRegister(
  tx: Tx,
  input: { tenantId: string; classId: string; day: string; periodId: string },
): Promise<string | null> {
  const [row] = await tx.execute<{ register_id: string }>(sql`
    select p.register_id from core.register_periods p
    join core.attendance_registers g on g.tenant_id = p.tenant_id and g.id = p.register_id
      and g.status = 'active'
    where p.tenant_id = ${input.tenantId}::uuid and p.class_id = ${input.classId}::uuid
      and p.taken_on = ${input.day}::date and p.class_period_id = ${input.periodId}::uuid
      and p.status = 'active'`);
  return row?.register_id ?? null;
}

/** Records the period a register is taken in. */
export async function linkPeriod(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    registerId: string;
    classId: string;
    day: string;
    periodId: string;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.register_periods (tenant_id, org_id, register_id, class_id, taken_on, class_period_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.registerId}::uuid,
      ${input.classId}::uuid, ${input.day}::date, ${input.periodId}::uuid)`);
}

/** The period each of these registers was taken in, for those taken in one. */
export async function periodsOfRegisters(
  tx: Tx,
  input: { tenantId: string; registerIds: readonly string[] },
): Promise<Map<string, TakenPeriod>> {
  if (input.registerIds.length === 0) return new Map();
  const rows = await tx.execute<{
    register_id: string;
    id: string;
    code: string;
    name_en: string | null;
    name_ar: string | null;
    sequence: number;
    kind: "lesson" | "registration";
    start_time: string | null;
    end_time: string | null;
    official_attendance: boolean;
  }>(sql`
    select r.register_id, p.id, p.code, p.name_en, p.name_ar, p.sequence, p.kind,
           to_char(p.start_time, 'HH24:MI') as start_time,
           to_char(p.end_time, 'HH24:MI') as end_time, p.official_attendance
    from core.register_periods r
    join core.class_periods p on p.tenant_id = r.tenant_id and p.id = r.class_period_id
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.register_id = any(${uuidArray(input.registerIds)})`);
  return new Map(
    rows.map((row) => [
      row.register_id,
      {
        id: row.id,
        code: row.code,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        sequence: row.sequence,
        kind: row.kind,
        startTime: row.start_time,
        endTime: row.end_time,
        official: row.official_attendance,
      },
    ]),
  );
}

/**
 * The registers a day's lessons owe: every class the timetable has meeting
 * that day unless cancelled for it, and every one-day lesson in a period
 * its bell schedule adds.
 */
export async function lessonsOwed(
  tx: Tx,
  input: { tenantId: string; schoolId: string; plan: DayPlan },
): Promise<{ classId: string; periodId: string }[]> {
  const added = input.plan.periods
    .filter(
      (row) =>
        row.scheduleId !== null &&
        (row.kind === "lesson" || row.kind === "registration"),
    )
    .map((row) => row.id);
  const day: SQL = sql`${input.plan.day}::date`;
  const rows = await tx.execute<{ class_id: string; period_id: string }>(sql`
    select m.class_id, m.class_period_id as period_id from core.class_meetings m
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.status = 'active' and ${heldOn(input.plan)}
      and not exists (select 1 from core.lesson_changes x
        where x.tenant_id = m.tenant_id and x.status = 'active' and x.cancelled
          and x.class_id = m.class_id and x.class_period_id = m.class_period_id
          and x.day_on = ${day})
    union
    select x.class_id, x.class_period_id from core.lesson_changes x
    join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id and c.runs @> x.day_on
    where x.tenant_id = ${input.tenantId}::uuid and x.org_id = ${input.schoolId}::uuid
      and x.status = 'active' and not x.cancelled and x.day_on = ${day}
      and x.class_period_id = any(${uuidArray(added)})`);
  return rows.map((row) => ({
    classId: row.class_id,
    periodId: row.period_id,
  }));
}

/** The first day on or after `from` (any day for null) a register was taken in one of these periods, or null. */
export async function firstRegisterIn(
  tx: Tx,
  input: {
    tenantId: string;
    periodIds: readonly string[];
    from: string | null;
  },
): Promise<string | null> {
  const [row] = await tx.execute<{ day: string | null }>(sql`
    select to_char(min(p.taken_on), 'YYYY-MM-DD') as day from core.register_periods p
    join core.attendance_registers g on g.tenant_id = p.tenant_id and g.id = p.register_id
      and g.status = 'active'
    where p.tenant_id = ${input.tenantId}::uuid and p.status = 'active'
      and p.class_period_id = any(${uuidArray(input.periodIds)})
      and (${input.from}::date is null or p.taken_on >= ${input.from}::date)`);
  return row?.day ?? null;
}
