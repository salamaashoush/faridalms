import { getLocale } from "~/i18n/runtime";
import { numberLocale } from "~/utils/digits";

/** A `date` column, always `YYYY-MM-DD`, rendered in the reader's locale. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(numberLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** A `time` column, always `HH:MM:SS`. */
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat(numberLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`1970-01-01T${value}Z`));
}

/**
 * Age in whole years and months.
 *
 * `ageOn` in the students repository is the same calculation, but that module
 * imports the database client, so pulling it into a component would drag the
 * driver into the browser bundle. `today` comes from the server payload rather
 * than the clock, which is what keeps SSR and hydration agreeing.
 */
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

export function percentOf(score: number, maxScore: number): number {
  if (maxScore <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

export interface SubjectRef {
  name: string;
  /** Only some subject selections include it; fall back to `name` when absent. */
  nameAr?: string;
}

export function subjectLabel(
  subject: SubjectRef | null | undefined,
): string | null {
  if (!subject) {
    return null;
  }
  return getLocale() === "ar" && subject.nameAr ? subject.nameAr : subject.name;
}
