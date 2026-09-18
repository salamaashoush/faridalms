import { getLocale } from "~/i18n/runtime";
import { formatDateTime } from "~/utils/datetime";

/**
 * Postgres `date` columns arrive as `2026-09-01`. Pinning them to midnight UTC
 * keeps the rendered day identical on the server and in the browser, whatever
 * the reader's offset is.
 */
export function formatDay(isoDate: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

/** Null stays null so the caller can hand it to `Value` and get words back. */
export function formatMoment(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return formatDateTime(value instanceof Date ? value.toISOString() : value);
}

/** Takes a whole-number rate, 0 to 100. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function compareText(a: string, b: string): number {
  return new Intl.Collator(getLocale(), {
    numeric: true,
    sensitivity: "base",
  }).compare(a, b);
}
