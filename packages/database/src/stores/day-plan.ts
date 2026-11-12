import type { CycleCalendar } from "@faridalms/domain/cycle";
import type {
  BellTimes,
  Cycle,
  CycleKind,
  DayTimes,
  PeriodKind,
} from "@faridalms/domain/timetable";
import type { SQL } from "drizzle-orm";

import {
  cycleDaysOn,
  inCycle,
  timetableOn,
  weekdayOfCycleDay,
} from "@faridalms/domain/cycle";
import { addDays } from "@faridalms/domain/school";
import { dayOpen, isoWeekday } from "@faridalms/domain/school-days";
import { timesOnWeekday } from "@faridalms/domain/timetable";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { runsAsDays, timetableDays } from "./bell-schedules";
import { markedMeanings, schoolWeek } from "./school-days";
import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface TimetableRow extends Cycle {
  id: string;
  version: number;
  nameEn: string | null;
  nameAr: string | null;
  startsOn: string;
}

/** A school's timetables in the order they start. */
export async function timetablesOf(
  tx: Tx,
  input: { tenantId: string; schoolId: string },
): Promise<TimetableRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    name_en: string | null;
    name_ar: string | null;
    starts_on: string;
    cycle_kind: CycleKind;
    cycle_length: number;
    first_day: number;
    closures_move: boolean;
  }>(sql`
    select id, version, name_en, name_ar,
           to_char(starts_on, 'YYYY-MM-DD') as starts_on, cycle_kind, cycle_length,
           first_day, closures_move
    from core.timetables
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active'
    order by starts_on`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    startsOn: row.starts_on,
    kind: row.cycle_kind,
    length: row.cycle_length,
    firstDay: row.first_day,
    closuresMove: row.closures_move,
  }));
}

export interface BellScheduleRow {
  id: string;
  version: number;
  nameEn: string | null;
  nameAr: string | null;
  times: BellTimes[];
}

export async function bellSchedulesOf(
  tx: Tx,
  input: { tenantId: string; schoolId: string },
): Promise<BellScheduleRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    name_en: string | null;
    name_ar: string | null;
    times: BellTimes[];
  }>(sql`
    select id, version, name_en, name_ar, times
    from core.bell_schedules
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active'
    order by coalesce(name_en, name_ar), id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    times: row.times.toSorted((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
}

/** A period as a day holds it, at that day's times. */
export interface PlannedPeriod {
  id: string;
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  sequence: number;
  kind: PeriodKind;
  startTime: string;
  endTime: string;
  official: boolean;
  weekdays: number[];
  /** Its own times, which most days keep. */
  ownStartTime: string;
  ownEndTime: string;
  /** The bell schedule whose own period it is, held only on its days; null for the school's. */
  scheduleId: string | null;
}

/** What a date holds: whether it is open, where its timetable's cycle stands, its periods and their times. */
export interface DayPlan {
  day: string;
  meaning: string | null;
  open: boolean;
  timetable: TimetableRow | null;
  /** The day of the timetable's cycle; null when no lessons are held. */
  cycleDay: number | null;
  /** The day of the cycle the date runs as instead of its own, when it does. */
  runsAs: number | null;
  schedule: { id: string; nameEn: string | null; nameAr: string | null } | null;
  /** Every period held that day, whatever its kind, in the order of the day. */
  periods: PlannedPeriod[];
}

interface PeriodVersion {
  id: string;
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  sequence: number;
  kind: PeriodKind;
  startTime: string;
  endTime: string;
  official: boolean;
  weekdays: number[];
  dayTimes: DayTimes[];
  from: string;
  until: string | null;
  scheduleId: string | null;
}

async function periodVersions(
  tx: Tx,
  input: { tenantId: string; schoolId: string },
): Promise<PeriodVersion[]> {
  const rows = await tx.execute<{
    id: string;
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
    valid_during: string | null;
    bell_schedule_id: string | null;
  }>(sql`
    select id, code, name_en, name_ar, sequence, kind,
           to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
           official_attendance, weekdays, day_times,
           case when bell_schedule_id is null then valid_during::text end as valid_during,
           bell_schedule_id
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and status = 'active'
    order by sequence`);
  return rows.map((row) => {
    const range = row.valid_during
      ? bounds(row.valid_during)
      : { from: "", to: null };
    return {
      id: row.id,
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
      scheduleId: row.bell_schedule_id,
    };
  });
}

/**
 * The periods a day holds and their times: those in force that run on the
 * weekday it runs as, at the times its bell schedule gives them, else at
 * their own times for that weekday. A period its bell schedule leaves out is
 * not held; the schedule's own periods are held on its days alone, at
 * their own times.
 */
function periodsOfDay(
  versions: readonly PeriodVersion[],
  day: string,
  weekday: number,
  schedule: BellScheduleRow | null,
): PlannedPeriod[] {
  const held = versions.flatMap((period) => {
    if (
      period.scheduleId === null &&
      (period.from > day || (period.until !== null && period.until <= day))
    )
      return [];
    if (period.scheduleId !== null && period.scheduleId !== schedule?.id)
      return [];
    const own =
      period.scheduleId === null
        ? timesOnWeekday(period, weekday)
        : { startTime: period.startTime, endTime: period.endTime };
    if (!own) return [];
    const times =
      schedule && period.scheduleId === null
        ? schedule.times.find((row) => row.code === period.code)
        : own;
    if (!times) return [];
    return [
      {
        id: period.id,
        code: period.code,
        nameEn: period.nameEn,
        nameAr: period.nameAr,
        sequence: period.sequence,
        kind: period.kind,
        startTime: times.startTime,
        endTime: times.endTime,
        official: period.official,
        weekdays: period.weekdays,
        ownStartTime: period.startTime,
        ownEndTime: period.endTime,
        scheduleId: period.scheduleId,
      },
    ];
  });
  return schedule
    ? held.toSorted(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) || a.sequence - b.sequence,
      )
    : held;
}

/**
 * What each of `days` holds at a school. This is the one place that
 * decides which timetable a date follows, the day of its cycle, and the
 * periods and times it keeps; registers, cover, weeks and feeds all read
 * their days from it. Whether a date is open is the school's week and the
 * days it marked, whatever timetable it follows.
 */
export async function dayPlans(
  tx: Tx,
  input: { tenantId: string; schoolId: string; days: readonly string[] },
): Promise<Map<string, DayPlan>> {
  const plans = new Map<string, DayPlan>();
  const days = [...new Set(input.days)].toSorted();
  if (days.length === 0) return plans;
  const first = days[0] ?? "";
  const last = days.at(-1) ?? "";
  const scope = { tenantId: input.tenantId, schoolId: input.schoolId };
  const [week, timetables, schedules, versions] = await Promise.all([
    schoolWeek(tx, input.tenantId, input.schoolId),
    timetablesOf(tx, scope),
    bellSchedulesOf(tx, scope),
    periodVersions(tx, scope),
  ]);
  const followed = new Map(
    days.map((day) => [day, timetableOn(timetables, day)] as const),
  );
  // A cycle counts from its timetable's start, so the marks are read from
  // the earliest start a day here follows; the count itself is worked out
  // from them, not by walking the days between.
  const since = [...followed.values()].reduce(
    (earliest, row) =>
      row && row.startsOn < earliest ? row.startsOn : earliest,
    first,
  );
  const [marks, runsAs, settings] = await Promise.all([
    markedMeanings(tx, {
      ...scope,
      from: addDays(since, -7),
      to: addDays(last, 7),
    }),
    runsAsDays(tx, { ...scope, to: last }),
    timetableDays(tx, { ...scope, from: first, to: last }),
  ]);
  const cycleCalendar: CycleCalendar = {
    marks,
    runsAs,
    weekStart: week.weekStart,
    weekendDays: week.weekendDays,
  };
  const scheduleOf = new Map(schedules.map((row) => [row.id, row]));
  const settingOf = new Map(settings.map((row) => [row.day, row]));
  const cycleDayOf = new Map<string, number | null>();
  for (const timetable of timetables)
    for (const [day, cycleDay] of cycleDaysOn(
      timetable,
      days.filter((one) => followed.get(one)?.id === timetable.id),
      cycleCalendar,
    ))
      cycleDayOf.set(day, cycleDay);
  for (const day of days) {
    const meaning = marks.get(day) ?? null;
    const open = dayOpen(week, day, meaning);
    const setting = settingOf.get(day);
    const schedule = setting?.scheduleId
      ? (scheduleOf.get(setting.scheduleId) ?? null)
      : null;
    const timetable = followed.get(day) ?? null;
    const runsAsDay =
      open && timetable && setting?.runsAs && inCycle(timetable, setting.runsAs)
        ? setting.runsAs
        : null;
    const weekday =
      runsAsDay !== null && timetable
        ? (weekdayOfCycleDay(timetable, runsAsDay) ?? isoWeekday(day))
        : isoWeekday(day);
    plans.set(day, {
      day,
      meaning,
      open,
      timetable,
      cycleDay: open ? (cycleDayOf.get(day) ?? null) : null,
      runsAs: runsAsDay,
      schedule: schedule
        ? { id: schedule.id, nameEn: schedule.nameEn, nameAr: schedule.nameAr }
        : null,
      periods: open ? periodsOfDay(versions, day, weekday, schedule) : [],
    });
  }
  return plans;
}

/**
 * The condition a meeting aliased `m` meets to be held on a planned day:
 * its timetable's, on that day of the cycle, in force, in a period held,
 * on a day its class runs.
 */
export function heldOn(plan: DayPlan): SQL {
  if (!plan.timetable || plan.cycleDay === null) return sql`false`;
  return sql`(m.timetable_id = ${plan.timetable.id}::uuid and m.weekday = ${plan.cycleDay}
    and m.valid_during @> ${plan.day}::date
    and m.class_period_id = any(${uuidArray(plan.periods.map((row) => row.id))})
    and exists (select 1 from core.classes held_class
      where held_class.tenant_id = m.tenant_id and held_class.id = m.class_id
        and held_class.runs @> ${plan.day}::date))`;
}

/** One day's plan. */
export async function dayPlan(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string },
): Promise<DayPlan> {
  const plans = await dayPlans(tx, { ...input, days: [input.day] });
  const plan = plans.get(input.day);
  if (!plan) throw new Error("a day's plan was not made");
  return plan;
}

/** The periods of a day lessons and registers are held in, at that day's times, in order. */
export async function teachingPeriodsOn(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string },
): Promise<PlannedPeriod[]> {
  const plan = await dayPlan(tx, input);
  return plan.periods.filter(
    (row) => row.kind === "lesson" || row.kind === "registration",
  );
}
