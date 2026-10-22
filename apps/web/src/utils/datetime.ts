import { getLocale } from "~/i18n/runtime";

import { numberLocale } from "./digits";

const DAY_MS = 86_400_000;

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

/** Takes a whole-number rate, 0 to 100. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(numberLocale(), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatList(values: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    values,
  );
}

export function formatChoices(values: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { type: "disjunction" }).format(
    values,
  );
}

export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat(numberLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

/** A calendar day with no time of day, for `date` columns such as `2026-09-14`. */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(numberLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

/** `2026-09` becomes "September 2026", or "سبتمبر ٢٠٢٦" in Arabic. */
export function formatMonthLabel(isoMonth: string): string {
  return new Intl.DateTimeFormat(numberLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoMonth.slice(0, 7)}-01T00:00:00.000Z`));
}

/**
 * A day in the school's second calendar, such as "3 Rabiʻ II" in Hijri, or
 * null when the school keeps none. The calendar is always named: CLDR moved
 * some Arabic regions' default away from Hijri, so a locale alone decides
 * nothing.
 */
export function secondaryDate(
  isoDate: string,
  calendar: "islamic-umalqura" | "islamic-civil" | null,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string | null {
  if (!calendar) return null;
  return new Intl.DateTimeFormat(numberLocale(), {
    ...options,
    calendar,
    timeZone: "UTC",
  }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
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
