import type { Cycle } from "./timetable";

import { addDays } from "./school";
import { dayOpen, dayRests, isoWeekday } from "./school-days";

/**
 * Where a lesson on a day of one cycle goes in another, for a timetable
 * that starts with the lessons of the one before it. A cycle of weeks
 * repeats its weeks to fill a longer one; any other pair copies only when
 * both cycles are the same, and null says they cannot be copied.
 */
export function copiedDays(
  from: Pick<Cycle, "kind" | "length">,
  to: Pick<Cycle, "kind" | "length">,
): ((day: number) => number[]) | null {
  if (from.kind !== to.kind) return null;
  if (from.kind === "days")
    return from.length === to.length ? (day) => [day] : null;
  if (to.length % from.length !== 0) return null;
  return (day) => {
    const week = Math.floor((day - 1) / 7);
    const weekday = ((day - 1) % 7) + 1;
    return Array.from({ length: to.length }, (_, index) => index)
      .filter((index) => index % from.length === week)
      .map((index) => index * 7 + weekday);
  };
}

/** The cycle's days a planner places lessons on, in the order a week reads them. */
export function cycleDays(
  cycle: Pick<Cycle, "kind" | "length">,
  schoolWeekdays: readonly number[],
): number[] {
  if (cycle.kind === "days")
    return Array.from({ length: cycle.length }, (_, index) => index + 1);
  return Array.from({ length: cycle.length }, (_, week) =>
    schoolWeekdays.map((day) => week * 7 + day),
  ).flat();
}

/** The ISO weekday a cycle day always falls on, or null for a cycle of days. */
export function weekdayOfCycleDay(
  cycle: Pick<Cycle, "kind">,
  day: number,
): number | null {
  return cycle.kind === "weeks" ? ((day - 1) % 7) + 1 : null;
}

/** Whether a day number is one of the cycle's days. */
export function inCycle(
  cycle: Pick<Cycle, "kind" | "length">,
  day: number,
): boolean {
  return (
    Number.isInteger(day) &&
    day >= 1 &&
    day <= (cycle.kind === "days" ? cycle.length : cycle.length * 7)
  );
}

/** Which week of its cycle a cycle day sits in, from 0. */
export const weekOfCycleDay = (day: number) => Math.floor((day - 1) / 7);

export interface DatedCycle extends Cycle {
  id: string;
  startsOn: string;
}

/**
 * The timetable a day follows: the last to start on or before it. A day
 * before the first timetable's start follows the first, so a year whose
 * dates move earlier keeps its lessons.
 */
export function timetableOn<T extends { startsOn: string }>(
  timetables: readonly T[],
  day: string,
): T | null {
  const ordered = timetables.toSorted((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );
  return ordered.findLast((row) => row.startsOn <= day) ?? ordered[0] ?? null;
}

const mod = (value: number, by: number) => ((value % by) + by) % by;

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`, negative when `to` is earlier. */
const daysFrom = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );

const weekStartOf = (day: string, weekStart: number) =>
  addDays(day, -mod(isoWeekday(day) - weekStart, 7));

/**
 * What the school marked, for counting a cycle: the days it marked as
 * something other than its week says, and the days the timetable runs as
 * another day of its cycle. A day that is not marked is open on a school
 * weekday and a rest day on the weekend.
 */
export interface CycleCalendar {
  marks: ReadonlyMap<string, string>;
  runsAs?: ReadonlyMap<string, number>;
  weekStart: number;
  weekendDays: readonly number[];
}

const meaningOf = (calendar: CycleCalendar, day: string) =>
  calendar.marks.get(day) ?? null;

const openOn = (calendar: CycleCalendar, day: string) =>
  dayOpen(calendar, day, meaningOf(calendar, day));

const restOn = (calendar: CycleCalendar, day: string) =>
  dayRests(calendar, day, meaningOf(calendar, day));

/** How many weekdays of `[from, to)` are not on the week's rest days. */
function weekdaysBetween(
  from: string,
  to: string,
  weekendDays: readonly number[],
): number {
  const length = daysFrom(from, to);
  if (length <= 0) return 0;
  const weekly = 7 - new Set(weekendDays).size;
  let count = Math.floor(length / 7) * weekly;
  for (let offset = 0; offset < length % 7; offset += 1)
    if (!weekendDays.includes(isoWeekday(addDays(from, offset)))) count += 1;
  return count;
}

/**
 * How many units of the cycle from `from` up to `to` use up a place:
 * weeks for a cycle of weeks (both given as week starts), days for a cycle
 * of days. Worked out from the week and from the marked days alone, never
 * by walking the days between.
 */
function countedBetween(
  cycle: Cycle,
  calendar: CycleCalendar,
  from: string,
  to: string,
): number {
  if (to <= from) return 0;
  const marked = [...calendar.marks.keys()].filter(
    (day) => day >= from && day < to,
  );
  if (cycle.kind === "weeks") {
    const weeks = daysFrom(from, to) / 7;
    if (!cycle.closuresMove) return weeks;
    const ownOpen = weekdaysBetween(
      from,
      addDays(from, 7),
      calendar.weekendDays,
    );
    let count = ownOpen > 0 ? weeks : 0;
    for (const start of new Set(
      marked.map((day) => weekStartOf(day, calendar.weekStart)),
    )) {
      const open = Array.from({ length: 7 }, (_, offset) =>
        addDays(start, offset),
      ).some((day) => openOn(calendar, day));
      count += (open ? 1 : 0) - (ownOpen > 0 ? 1 : 0);
    }
    return count;
  }
  let count = weekdaysBetween(from, to, calendar.weekendDays);
  for (const day of marked) {
    const usual = calendar.weekendDays.includes(isoWeekday(day)) ? 0 : 1;
    const counts = cycle.closuresMove
      ? openOn(calendar, day)
      : !restOn(calendar, day);
    count += (counts ? 1 : 0) - usual;
  }
  return count;
}

/**
 * The day of its cycle each of `days` falls on, or null on a day no
 * lessons are held. Counting starts on the timetable's first day. A day
 * run as another day of the cycle is that day; where closures hold a cycle
 * of days in place, the days after it carry on from there, as they would
 * after a closure, and otherwise they keep their own places.
 */
export function cycleDaysOn(
  cycle: Cycle & { startsOn: string },
  days: readonly string[],
  calendar: CycleCalendar,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const anchor =
    cycle.kind === "weeks"
      ? weekStartOf(cycle.startsOn, calendar.weekStart)
      : cycle.startsOn;
  const unitOf = (day: string) =>
    cycle.kind === "weeks" ? weekStartOf(day, calendar.weekStart) : day;
  const runsAs = (day: string) => {
    const value = calendar.runsAs?.get(day) ?? null;
    return value !== null && openOn(calendar, day) && inCycle(cycle, value)
      ? value
      : null;
  };
  const resumes = cycle.kind === "days" && cycle.closuresMove;
  // The days a cycle of days picks up from, in order; each resets the
  // place the days after it count from.
  const restarts = resumes
    ? [...(calendar.runsAs?.keys() ?? [])]
        .filter((day) => day >= anchor && runsAs(day) !== null)
        .toSorted()
    : [];
  const positionOf = (unit: string) => {
    if (unit < anchor) return -countedBetween(cycle, calendar, unit, anchor);
    let seen = 0;
    let from = anchor;
    for (const restart of restarts) {
      if (restart > unit) break;
      seen += countedBetween(cycle, calendar, from, restart);
      seen += mod(
        (runsAs(restart) ?? 1) - 1 - (cycle.firstDay - 1 + seen),
        cycle.length,
      );
      from = restart;
    }
    return seen + countedBetween(cycle, calendar, from, unit);
  };
  for (const day of [...new Set(days)].toSorted()) {
    if (!openOn(calendar, day)) {
      out.set(day, null);
      continue;
    }
    const runs = runsAs(day);
    if (runs !== null) {
      out.set(day, runs);
      continue;
    }
    const place = mod(
      cycle.firstDay - 1 + positionOf(unitOf(day)),
      cycle.length,
    );
    out.set(
      day,
      cycle.kind === "weeks" ? place * 7 + isoWeekday(day) : place + 1,
    );
  }
  return out;
}
