import type { Cycle } from "./timetable";

import { SCHOOL_DAY_MEANINGS } from "./calendar";
import { addDays } from "./school";
import { isoWeekday } from "./timetable";

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

const weekStartOf = (day: string, weekStart: number) =>
  addDays(day, -mod(isoWeekday(day) - weekStart, 7));

/**
 * What a day is for counting a cycle: open when lessons are held, a rest
 * day when it is the weekend. A day the calendar does not mark is open on
 * a school weekday.
 */
export interface CycleCalendar {
  meaningOf: (day: string) => string | null;
  weekStart: number;
  weekendDays: readonly number[];
}

function openOn(calendar: CycleCalendar, day: string) {
  const meaning = calendar.meaningOf(day);
  if (meaning === null) return !calendar.weekendDays.includes(isoWeekday(day));
  return SCHOOL_DAY_MEANINGS.includes(meaning);
}

function restOn(calendar: CycleCalendar, day: string) {
  const meaning = calendar.meaningOf(day);
  if (meaning === null) return calendar.weekendDays.includes(isoWeekday(day));
  return meaning === "weekend";
}

/**
 * The day of its cycle each of `days` falls on, or null on a day no
 * lessons are held. Counting starts on the timetable's first day.
 */
export function cycleDaysOn(
  cycle: Cycle & { startsOn: string },
  days: readonly string[],
  calendar: CycleCalendar,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (days.length === 0) return out;
  const sorted = [...new Set(days)].toSorted();
  const first = sorted[0] ?? cycle.startsOn;
  const last = sorted.at(-1) ?? cycle.startsOn;
  const anchor =
    cycle.kind === "weeks"
      ? weekStartOf(cycle.startsOn, calendar.weekStart)
      : cycle.startsOn;
  const counts = (day: string) =>
    cycle.kind === "weeks"
      ? !cycle.closuresMove ||
        Array.from({ length: 7 }, (_, offset) => addDays(day, offset)).some(
          (one) => openOn(calendar, one),
        )
      : cycle.closuresMove
        ? openOn(calendar, day)
        : !restOn(calendar, day);
  const step = cycle.kind === "weeks" ? 7 : 1;
  const unitOf = (day: string) =>
    cycle.kind === "weeks" ? weekStartOf(day, calendar.weekStart) : day;
  // How many counted units lie between the anchor and each unit, walking
  // once over the span the days and the anchor cover.
  const position = new Map<string, number>();
  const start = unitOf(first) < anchor ? unitOf(first) : anchor;
  const end = unitOf(last) > anchor ? unitOf(last) : anchor;
  let before = 0;
  for (let unit = start; unit < anchor; unit = addDays(unit, step))
    if (counts(unit)) before += 1;
  let seen = -before;
  for (let unit = start; unit <= end; unit = addDays(unit, step)) {
    position.set(unit, seen);
    if (counts(unit)) seen += 1;
  }
  for (const day of sorted) {
    if (!openOn(calendar, day)) {
      out.set(day, null);
      continue;
    }
    const elapsed = position.get(unitOf(day)) ?? 0;
    const place = mod(cycle.firstDay - 1 + elapsed, cycle.length);
    out.set(
      day,
      cycle.kind === "weeks" ? place * 7 + isoWeekday(day) : place + 1,
    );
  }
  return out;
}
