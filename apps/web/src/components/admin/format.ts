import { getLocale } from "~/i18n/runtime";
import { formatDateTime } from "~/utils/datetime";
import { numberLocale } from "~/utils/digits";

/**
 * Postgres `date` columns arrive as `2026-09-01`. Pinning them to midnight UTC
 * keeps the rendered day identical on the server and in the browser, whatever
 * the reader's offset is.
 */
export function formatDay(isoDate: string): string {
  return new Intl.DateTimeFormat(numberLocale(), {
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

export function compareText(a: string, b: string): number {
  return new Intl.Collator(getLocale(), {
    numeric: true,
    sensitivity: "base",
  }).compare(a, b);
}
