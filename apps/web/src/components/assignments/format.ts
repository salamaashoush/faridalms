import { getLocale } from "~/i18n/runtime";

/** An instant shown on the school's clock, so a deadline reads the same for everyone. */
export function formatInstant(
  value: string | Date | null | undefined,
  timeZone: string,
): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatMegabytes(bytes: number): string {
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024));
}
