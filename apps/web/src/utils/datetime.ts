import type {
  DaySpan,
  DayStyle,
  HijriCalendar,
  HijriStyle,
  InstantStyle,
} from "@faridalms/domain/date-text";

import {
  formatDayIn,
  formatDayRangeIn,
  formatHijriIn,
  formatInstantIn,
  formatListIn,
  formatMonthIn,
  formatSpanIn,
  formatTimeIn,
  formatWeekdayIn,
} from "@faridalms/domain/date-text";
import {
  schoolClock,
  schoolDate,
  zonedInstant,
  zonedLocal,
} from "@faridalms/domain/school";

import type { Locale } from "~/i18n/runtime";

import { getLocale } from "~/i18n/runtime";

import { numberLocale } from "./digits";

export type { DayStyle, InstantStyle };

const DAY_MS = 86_400_000;

// The school's zone, which every instant is shown and entered in. Held here
// once the page knows its school; the server keeps one per request.
let adopted: string | null = null;
let zoneSource: () => string = () => adopted ?? "UTC";
let keepZone: (next: string) => void = (next) => {
  adopted = next;
};

/**
 * Where the zone comes from while the server draws a page: the request's
 * own, so two schools' pages drawn at once keep their own.
 */
export function overwriteZoneSource(
  read: () => string,
  adopt?: (next: string) => void,
) {
  zoneSource = read;
  if (adopt) keepZone = adopt;
}

/**
 * Draws the rest of the page on a school's clock, as the signed-in app and
 * a school's website do once they know their school. The server and the
 * browser each adopt it as the page is drawn, so the two drawings agree.
 */
export function adoptSchoolZone(next: string) {
  if (zoneSource() !== next) keepZone(next);
}

/** The time zone of the reader's school, never the browser's own. */
export const schoolZone = (): string => zoneSource();

/**
 * `now` is injectable so callers can render a stable value. The seeded fixtures
 * are dated relative to a fixed epoch, so passing the wall clock here would make
 * the rendered output drift over time (and differ between server and client).
 */
export function formatRelativeDays(
  isoDate: string,
  now: number = Date.now(),
): string {
  const days = Math.round((Date.parse(isoDate) - now) / DAY_MS);
  const formatter = new Intl.RelativeTimeFormat(numberLocale(), {
    numeric: "auto",
  });
  return formatter.format(days, "day");
}

/** How long ago an instant was, in the largest whole unit: "5 minutes ago", "yesterday". */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(numberLocale(), {
    numeric: "auto",
  });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size)
      return formatter.format(Math.round(seconds / size), unit);
  return formatter.format(0, "minute");
}

/** Locale-aware: 10,000 in English, ١٠٬٠٠٠ in Arabic. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(numberLocale()).format(value);
}

/** An amount of money in its currency, in the reader's digits: EGP 1,500 or ١٬٥٠٠ ج.م. */
export function formatAmount(value: number, currency: string): string {
  return new Intl.NumberFormat(numberLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/** Takes a whole-number rate, 0 to 100. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(numberLocale(), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

/** Items as one phrase: "a, b, and c". */
export function formatList(values: readonly string[]): string {
  return formatListIn(values, "and", getLocale());
}

/** Items as alternatives: "a, b, or c". */
export function formatChoices(values: readonly string[]): string {
  return formatListIn(values, "or", getLocale());
}

/**
 * A calendar day with no time of day, for `date` columns such as
 * `2026-09-14`: "14 Sept 2026", or with `weekday` "Monday 14 September".
 */
export function formatDate(
  isoDate: string,
  style: DayStyle = "medium",
  locale: Locale = getLocale(),
): string {
  return formatDayIn(isoDate, style, numberLocale(locale));
}

/** Two calendar days as one span, sharing what they share: "7 – 25 Sept 2026". */
export function formatDayRange(
  first: string,
  last: string,
  style: DayStyle = "medium",
): string {
  return formatDayRangeIn(first, last, style, numberLocale());
}

/**
 * An instant (a timestamp) on the school's clock, whatever zone the reader's
 * device is in: "Mon 14 Sept, 9:00", or with `medium` "14 Sept 2026, 9:00".
 */
export function formatInstant(
  iso: string | Date,
  style: InstantStyle = "full",
  locale: Locale = getLocale(),
): string {
  return formatInstantIn(iso, style, schoolZone(), numberLocale(locale));
}

/** A time of day (a `time` column such as `08:30:00`) as the reader's clock writes it. */
export function formatTime(time: string): string {
  return formatTimeIn(time, numberLocale());
}

/** The calendar day an instant falls on at the school, `YYYY-MM-DD`. */
export function schoolDayOf(iso: string | Date): string {
  return schoolDate(
    schoolZone(),
    typeof iso === "string" ? new Date(iso) : iso,
  );
}

/** The school's clock at an instant, `HH:MM`, for comparing with timetable times. */
export function schoolClockAt(at: Date = new Date()): string {
  return schoolClock(schoolZone(), at);
}

/** A date-time input's value for an instant: the school's wall clock, or empty. */
export function localInput(iso: string | null | undefined): string {
  return iso ? zonedLocal(iso, schoolZone()) : "";
}

/**
 * The instant a date-time input's value (`YYYY-MM-DDTHH:MM`, or a bare day
 * read as its start) names on the school's clock; empty for an empty input.
 */
export function instantFromLocal(local: string): string {
  if (!local) return "";
  const [date = "", time = "00:00"] = local.split("T");
  return zonedInstant(date, time.slice(0, 5), schoolZone()).toISOString();
}

/** A month's short name alone, such as "Sep", for a timeline's scale. */
export function formatMonthShort(
  isoDate: string,
  locale: Locale = getLocale(),
): string {
  return formatMonthIn(isoDate, "short", numberLocale(locale));
}

/** `2026-09` becomes "September 2026", or "سبتمبر ٢٠٢٦" in Arabic. */
export function formatMonthLabel(isoMonth: string): string {
  return formatMonthIn(isoMonth, "label", numberLocale());
}

/** An ISO weekday (1 for Monday) named in the reader's language. */
export function formatWeekday(
  day: number,
  width: "long" | "short" = "long",
): string {
  return formatWeekdayIn(day, width, getLocale());
}

/**
 * Days that may carry wall-clock times of their own, such as an event's,
 * as one span: its days and, if timed, its hours, in full or short.
 */
export function formatSpan(
  span: DaySpan,
  style: "long" | "short" = "long",
  locale: Locale = getLocale(),
): string {
  return formatSpanIn(span, style, numberLocale(locale));
}

/**
 * A day in the school's second calendar, such as "3 Rabiʻ II" in Hijri, or
 * null when the school keeps none.
 */
export function secondaryDate(
  isoDate: string,
  calendar: HijriCalendar | null,
  style: HijriStyle = "short",
): string | null {
  if (!calendar) return null;
  return formatHijriIn(isoDate, calendar, style, numberLocale());
}

const inUnit = (value: number, unit: "hour" | "minute") =>
  new Intl.NumberFormat(numberLocale(), {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(value);

/** A length of time in whole minutes, as hours and minutes: "1 hour and 30 minutes". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return formatList([
    ...(hours > 0 ? [inUnit(hours, "hour")] : []),
    ...(rest > 0 || hours === 0 ? [inUnit(rest, "minute")] : []),
  ]);
}

/** Time left on a clock in the locale's digits: "4:05", or "1:04:05" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const two = new Intl.NumberFormat(numberLocale(), {
    minimumIntegerDigits: 2,
  });
  const one = new Intl.NumberFormat(numberLocale());
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${one.format(hours)}:${two.format(minutes)}:${two.format(seconds)}`
    : `${one.format(minutes)}:${two.format(seconds)}`;
}
