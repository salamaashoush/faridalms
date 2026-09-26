import { getLocale } from "~/i18n/runtime";

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
  const formatter = new Intl.RelativeTimeFormat(getLocale(), {
    numeric: "auto",
  });
  return formatter.format(days, "day");
}

/** Locale-aware: 10,000 in English, ١٠٬٠٠٠ in Arabic. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLocale()).format(value);
}

export function formatList(values: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    values,
  );
}

export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

/** A calendar day with no time of day, for `date` columns such as `2026-09-14`. */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

/** `2026-09` becomes "September 2026", or "سبتمبر ٢٠٢٦" in Arabic. */
export function formatMonthLabel(isoMonth: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoMonth.slice(0, 7)}-01T00:00:00.000Z`));
}
