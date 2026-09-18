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
