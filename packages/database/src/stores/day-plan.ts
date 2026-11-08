import type { CycleCalendar } from "@faridalms/domain/cycle";
import type {
  BellTimes,
  Cycle,
  CycleKind,
  DayTimes,
  PeriodKind,
} from "@faridalms/domain/timetable";
import type { SQL } from "drizzle-orm";

import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";
import {
  cycleDaysOn,
  inCycle,
  timetableOn,
  weekdayOfCycleDay,
} from "@faridalms/domain/cycle";
import { isoWeekday, timesOnWeekday } from "@faridalms/domain/timetable";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { bounds, uuidArray } from "./sql";
import { schoolWeek, schoolYears } from "./years";

type Tx = CellTransaction;

export interface TimetableRow extends Cycle {
  id: string;
  version: number;
  yearId: string;
  nameEn: string | null;
  nameAr: string | null;
  startsOn: string;
}

/** A year's timetables in the order they start. */
export async function timetablesOf(
  tx: Tx,
  input: { tenantId: string; yearIds: readonly string[] },
): Promise<TimetableRow[]> {
  if (input.yearIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    version: number;
    school_year_id: string;
    name_en: string | null;
    name_ar: string | null;
    starts_on: string;
    cycle_kind: CycleKind;
    cycle_length: number;
    first_day: number;
    closures_move: boolean;
  }>(sql`
    select id, version, school_year_id, name_en, name_ar,
           to_char(starts_on, 'YYYY-MM-DD') as starts_on, cycle_kind, cycle_length,
           first_day, closures_move
    from core.timetables
    where tenant_id = ${input.tenantId}::uuid and school_year_id = any(${uuidArray(input.yearIds)})
      and status = 'active'
    order by starts_on`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    yearId: row.school_year_id,
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
  yearId: string;
  nameEn: string | null;
  nameAr: string | null;
  times: BellTimes[];
}

export async function bellSchedulesOf(
  tx: Tx,
  input: { tenantId: string; yearIds: readonly string[] },
): Promise<BellScheduleRow[]> {
  if (input.yearIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    version: number;
    school_year_id: string;
    name_en: string | null;
    name_ar: string | null;
    times: BellTimes[];
  }>(sql`
    select id, version, school_year_id, name_en, name_ar, times
    from core.bell_schedules
    where tenant_id = ${input.tenantId}::uuid and school_year_id = any(${uuidArray(input.yearIds)})
      and status = 'active'
    order by coalesce(name_en, name_ar), id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    yearId: row.school_year_id,
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
  /** The bell schedule whose own period it is, held only on its days; null for the year's. */
  scheduleId: string | null;
}

/** What a date holds: whether it is open, where its timetable's cycle stands, its periods and their times. */
export interface DayPlan {
  day: string;
  yearId: string | null;
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
  yearId: string;
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
  until: string;
  scheduleId: string | null;
}

async function periodVersions(
  tx: Tx,
  input: { tenantId: string; yearIds: readonly string[] },
): Promise<PeriodVersion[]> {
  const rows = await tx.execute<{
    id: string;
    school_year_id: string;
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
    bell_schedule_id: string | null;
  }>(sql`
    select id, school_year_id, code, name_en, name_ar, sequence, kind,
           to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
           official_attendance, weekdays, day_times, valid_during::text as valid_during,
           bell_schedule_id
    from core.class_periods
    where tenant_id = ${input.tenantId}::uuid and school_year_id = any(${uuidArray(input.yearIds)})
      and status = 'active'
    order by sequence`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      yearId: row.school_year_id,
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
      scheduleId: row.bell_schedule_id,
    };
  });
}

async function calendarOf(
  tx: Tx,
  input: { tenantId: string; yearIds: readonly string[] },
) {
  const rows = await tx.execute<{
    day: string;
    meaning: string;
    bell_schedule_id: string | null;
    runs_as: number | null;
  }>(sql`
    select to_char(d.day_on, 'YYYY-MM-DD') as day, e.system_meaning as meaning, d.bell_schedule_id,
           d.runs_as
    from core.calendar_dates d
    join core.calendars c on c.tenant_id = d.tenant_id and c.id = d.calendar_id
      and c.kind = 'school' and c.status = 'active'
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${input.tenantId}::uuid and d.school_year_id = any(${uuidArray(input.yearIds)})
      and d.status = 'active'`);
  return new Map(rows.map((row) => [row.day, row]));
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
    if (period.from > day || period.until <= day) return [];
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
 * their days from it.
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
  const [years, week] = await Promise.all([
    schoolYears(tx, input.tenantId, input.schoolId),
    schoolWeek(tx, input.tenantId, input.schoolId),
  ]);
  const held = years.filter(
    (year) => year.startsOn <= last && first < year.endsBefore,
  );
  const yearIds = held.map((year) => year.id);
  const [timetables, schedules, versions, calendar] = await Promise.all([
    timetablesOf(tx, { tenantId: input.tenantId, yearIds }),
    bellSchedulesOf(tx, { tenantId: input.tenantId, yearIds }),
    periodVersions(tx, { tenantId: input.tenantId, yearIds }),
    calendarOf(tx, { tenantId: input.tenantId, yearIds }),
  ]);
  const cycleCalendar: CycleCalendar = {
    meaningOf: (day) => calendar.get(day)?.meaning ?? null,
    runsAsOf: (day) => calendar.get(day)?.runs_as ?? null,
    weekStart: week.weekStart,
    weekendDays: week.weekendDays,
  };
  const scheduleOf = new Map(schedules.map((row) => [row.id, row]));
  const yearOf = (day: string) =>
    held.find((year) => year.startsOn <= day && day < year.endsBefore) ?? null;
  const cycleDayOf = new Map<string, number | null>();
  for (const year of held) {
    const own = timetables.filter((row) => row.yearId === year.id);
    const inYear = days.filter((day) => yearOf(day)?.id === year.id);
    for (const timetable of own) {
      const followed = inYear.filter(
        (day) => timetableOn(own, day)?.id === timetable.id,
      );
      for (const [day, cycleDay] of cycleDaysOn(
        timetable,
        followed,
        cycleCalendar,
      ))
        cycleDayOf.set(day, cycleDay);
    }
  }
  for (const day of days) {
    const year = yearOf(day);
    const mark = calendar.get(day);
    const meaning = year ? (mark?.meaning ?? null) : null;
    const open =
      year !== null &&
      (meaning === null
        ? !week.weekendDays.includes(isoWeekday(day))
        : SCHOOL_DAY_MEANINGS.includes(meaning));
    const schedule = mark?.bell_schedule_id
      ? (scheduleOf.get(mark.bell_schedule_id) ?? null)
      : null;
    const timetable = year
      ? timetableOn(
          timetables.filter((row) => row.yearId === year.id),
          day,
        )
      : null;
    const runsAs =
      open && timetable && mark?.runs_as && inCycle(timetable, mark.runs_as)
        ? mark.runs_as
        : null;
    const weekday =
      runsAs !== null && timetable
        ? (weekdayOfCycleDay(timetable, runsAs) ?? isoWeekday(day))
        : isoWeekday(day);
    plans.set(day, {
      day,
      yearId: year?.id ?? null,
      meaning,
      open,
      timetable,
      cycleDay: open ? (cycleDayOf.get(day) ?? null) : null,
      runsAs,
      schedule: schedule
        ? { id: schedule.id, nameEn: schedule.nameEn, nameAr: schedule.nameAr }
        : null,
      periods: year
        ? periodsOfDay(
            versions.filter((row) => row.yearId === year.id),
            day,
            weekday,
            schedule,
          )
        : [],
    });
  }
  return plans;
}

/**
 * The condition a meeting aliased `m` meets to be held on a planned day:
 * its timetable's, on that day of the cycle, in force, in a period held.
 */
export function heldOn(plan: DayPlan): SQL {
  if (!plan.timetable || plan.cycleDay === null) return sql`false`;
  return sql`(m.timetable_id = ${plan.timetable.id}::uuid and m.weekday = ${plan.cycleDay}
    and m.valid_during @> ${plan.day}::date
    and m.class_period_id = any(${uuidArray(plan.periods.map((row) => row.id))}))`;
}

/** One day's plan; a day outside every year holds nothing. */
export async function dayPlan(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string },
): Promise<DayPlan> {
  const plans = await dayPlans(tx, { ...input, days: [input.day] });
  return (
    plans.get(input.day) ?? {
      day: input.day,
      yearId: null,
      meaning: null,
      open: false,
      timetable: null,
      cycleDay: null,
      runsAs: null,
      schedule: null,

      periods: [],
    }
  );
}
