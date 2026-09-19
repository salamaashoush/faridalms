// Pure date and scheduling helpers.
//
// Deliberately free of any database import: these are the parts worth unit
// testing, and a test for them should not need a running Postgres.

export function schoolDate(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wall = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return Math.round((wall - at.getTime()) / 60_000);
}

/** The instant at which a school-local wall-clock time (`HH:MM`) occurs. */
export function zonedInstant(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const naive = Date.parse(`${date}T${time}:00Z`);
  let result = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  const settled = zoneOffsetMinutes(new Date(result), timeZone);
  if (naive - settled * 60_000 !== result) result = naive - settled * 60_000;
  return new Date(result);
}

/** An instant as the school's wall clock, `YYYY-MM-DDTHH:MM`, for date-time inputs. */
export function zonedLocal(instant: string | Date, timeZone: string): string {
  const at = typeof instant === "string" ? new Date(instant) : instant;
  const shifted = new Date(
    at.getTime() + zoneOffsetMinutes(at, timeZone) * 60_000,
  );
  return shifted.toISOString().slice(0, 16);
}

/** Age in whole years and months, or `null` when no birthdate is recorded. */
export function ageOn(
  birthdate: string | null,
  today: string,
): { years: number; months: number } | null {
  if (!birthdate) {
    return null;
  }
  const born = new Date(`${birthdate}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  let months =
    (now.getUTCFullYear() - born.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - born.getUTCMonth());
  if (now.getUTCDate() < born.getUTCDate()) {
    months -= 1;
  }
  if (months < 0) {
    return null;
  }
  return { years: Math.floor(months / 12), months: months % 12 };
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface DatedWeek {
  startsOn: string;
  endsOn: string;
}

/**
 * The teaching week a date belongs to.
 *
 * Weeks are Sunday to Thursday, so the weekend between two weeks belongs to
 * the week that has just ended, and a date before the first week belongs to
 * the first. Navigation and assignment ownership both use this rule; when they
 * disagreed, work created on a Friday landed in no week and was listed nowhere.
 */
export function weekForDate<T extends DatedWeek>(
  weeks: readonly T[],
  date: string,
): T | undefined {
  const ordered = weeks.toSorted((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );
  let owner = ordered[0];
  for (const week of ordered) {
    if (week.startsOn > date) break;
    owner = week;
  }
  return owner;
}

/**
 * Teaching weeks covering an inclusive date range with no gaps: each runs
 * from a Sunday, the first day of the Egyptian school week, to the next
 * Saturday, clipped to the range. Numbering continues from `firstNumber`.
 */
export function teachingWeeks(
  startsOn: string,
  endsOn: string,
  firstNumber = 1,
): { number: number; startsOn: string; endsOn: string }[] {
  const weeks: { number: number; startsOn: string; endsOn: string }[] = [];
  let cursor = startsOn;
  while (cursor <= endsOn) {
    const saturday = addDays(cursor, 6 - weekdayOf(cursor));
    const last = saturday < endsOn ? saturday : endsOn;
    weeks.push({
      number: firstNumber + weeks.length,
      startsOn: cursor,
      endsOn: last,
    });
    cursor = addDays(last, 1);
  }
  return weeks;
}

/** Inclusive, so a single-day event is one day long rather than zero. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Every ISO date an inclusive range covers. */
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    out.push(cursor);
  }
  return out;
}

export function isWithin(date: string, from: string, to: string): boolean {
  return from <= date && date <= to;
}

/**
 * The calendar grid for a month, padded to whole weeks starting Sunday.
 *
 * Returns `null` for padding cells rather than dates from the neighbouring
 * month, so a caller cannot accidentally attach an event to the wrong month.
 */
export function monthGrid(month: string): (string | null)[][] {
  const [yearPart = "1970", monthPart = "01"] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;

  const first = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leading = first.getUTCDay();

  const cells: (string | null)[] = Array.from<null>({ length: leading }).fill(
    null,
  );
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** Step an ISO year-month by whole months, wrapping the year. */
export function shiftMonth(month: string, delta: number): string {
  const [yearPart = "1970", monthPart = "01"] = month.split("-");
  const date = new Date(
    Date.UTC(Number(yearPart), Number(monthPart) - 1 + delta, 1),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 0 = Sunday, matching the Egyptian school week. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Trim a `HH:MM:SS` column value down to what a timetable should show. */
export function formatClock(time: string): string {
  return time.slice(0, 5);
}
