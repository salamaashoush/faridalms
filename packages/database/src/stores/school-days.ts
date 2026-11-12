import type { DayKind, SchoolWeek } from "@faridalms/domain/school-days";

import { addDays } from "@faridalms/domain/school";
import { dayOpen, paintReaches } from "@faridalms/domain/school-days";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { calendarDates } from "../tables/calendar";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

export async function schoolWeek(
  tx: Tx,
  tenantId: string,
  schoolId: string,
): Promise<SchoolWeek> {
  const [row] = await tx.execute<{
    week_start: number;
    weekend_days: number[];
  }>(sql`
    select week_start, weekend_days from core.orgs
    where tenant_id = ${tenantId}::uuid and id = ${schoolId}::uuid`);
  return {
    weekStart: row?.week_start ?? 7,
    weekendDays: row?.weekend_days ?? [5, 6],
  };
}

/** A day the school marked as other than its week says. */
export interface DayMark {
  day: string;
  meaning: string;
  noteEn: string | null;
  noteAr: string | null;
  provisional: boolean;
}

/** The days of `[from, to]` the school marked, in date order. */
export async function dayMarks(
  tx: Tx,
  input: { tenantId: string; schoolId: string; from: string; to: string },
): Promise<DayMark[]> {
  const rows = await tx.execute<{
    day: string;
    meaning: string;
    note_en: string | null;
    note_ar: string | null;
    provisional: boolean;
  }>(sql`
    select to_char(d.day_on, 'YYYY-MM-DD') as day, e.system_meaning as meaning,
           d.note_en, d.note_ar, d.provisional
    from core.calendar_dates d
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${input.tenantId}::uuid and d.org_id = ${input.schoolId}::uuid
      and d.status = 'active' and e.system_meaning is not null
      and d.day_on between ${input.from}::date and ${input.to}::date
    order by d.day_on`);
  return rows.map((row) => ({
    day: row.day,
    meaning: row.meaning,
    noteEn: row.note_en,
    noteAr: row.note_ar,
    provisional: row.provisional,
  }));
}

/** What the school marked each day of `[from, to]` as, by day; an unmarked day is absent. */
export async function markedMeanings(
  tx: Tx,
  input: { tenantId: string; schoolId: string; from: string; to: string },
): Promise<Map<string, string>> {
  return new Map(
    (await dayMarks(tx, input)).map((row) => [row.day, row.meaning]),
  );
}

/** Whether lessons are held on a day, and what the school marked it as. */
export async function schoolDay(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string },
): Promise<{ open: boolean; meaning: string | null }> {
  const [week, marks] = await Promise.all([
    schoolWeek(tx, input.tenantId, input.schoolId),
    markedMeanings(tx, { ...input, from: input.day, to: input.day }),
  ]);
  const meaning = marks.get(input.day) ?? null;
  return { open: dayOpen(week, input.day, meaning), meaning };
}

/**
 * Marks the school's days in `[from, to]` as one kind, returning how many
 * changed. `normal` takes the marks away; every other kind leaves an
 * unmarked weekend alone unless it is a make-up day.
 */
export async function paintDays(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    from: string;
    to: string;
    kind: DayKind;
    noteEn: string | null;
    noteAr: string | null;
    provisional: boolean;
  },
): Promise<number> {
  await tx.execute(sql`select app.lock(${`school_days:${input.schoolId}`})`);
  const [week, marked] = await Promise.all([
    schoolWeek(tx, input.tenantId, input.schoolId),
    tx.execute<{ id: string; day: string; meaning: string | null }>(sql`
      select d.id, to_char(d.day_on, 'YYYY-MM-DD') as day, e.system_meaning as meaning
      from core.calendar_dates d
      join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
      where d.tenant_id = ${input.tenantId}::uuid and d.org_id = ${input.schoolId}::uuid
        and d.status = 'active'
        and d.day_on between ${input.from}::date and ${input.to}::date`),
  ]);
  const markOf = new Map(marked.map((row) => [row.day, row]));
  const days: string[] = [];
  for (let day = input.from; day <= input.to; day = addDays(day, 1))
    if (paintReaches(week, input.kind, day, markOf.get(day)?.meaning ?? null))
      days.push(day);
  if (days.length === 0) return 0;
  const existing = days.flatMap((day) => {
    const row = markOf.get(day);
    return row ? [row.id] : [];
  });
  if (input.kind === "normal") {
    await tx.execute(sql`
      update core.calendar_dates set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(existing)})`);
    return existing.length;
  }
  const [descriptor] = await tx.execute<{ id: string }>(sql`
    select id from core.descriptors
    where tenant_id = ${input.tenantId}::uuid and namespace = 'calendar_event'
      and system_meaning = ${input.kind} and status = 'active'
    order by org_id nulls first
    limit 1`);
  if (!descriptor)
    throw new Error(`calendar day descriptor missing for ${input.kind}`);
  const values = {
    eventDescriptorId: descriptor.id,
    noteEn: input.noteEn || null,
    noteAr: input.noteAr || null,
    provisional: input.provisional,
  };
  if (existing.length > 0)
    await tx.execute(sql`
      update core.calendar_dates
      set event_descriptor_id = ${values.eventDescriptorId}::uuid, note_en = ${values.noteEn},
          note_ar = ${values.noteAr}, provisional = ${values.provisional}
      where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(existing)})`);
  const fresh = days.filter((day) => !markOf.has(day));
  for (let index = 0; index < fresh.length; index += 200)
    await tx.insert(calendarDates).values(
      fresh.slice(index, index + 200).map((day) => ({
        tenantId: input.tenantId,
        orgId: input.schoolId,
        dayOn: day,
        ...values,
      })),
    );
  return days.length;
}
