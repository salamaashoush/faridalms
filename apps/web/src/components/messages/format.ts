import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

interface Named {
  fullNameEn: string | null;
  fullNameAr: string | null;
}

export function nameOf(person: Named): string {
  return inLocale(person.fullNameEn, person.fullNameAr);
}

/** What a conversation is called: its subject, or the people in it. */
export function threadTitle(thread: {
  subject: string | null;
  others: Named[];
}): string {
  if (thread.subject) return thread.subject;
  const names = thread.others.map(nameOf).filter(Boolean);
  if (names.length === 0) return m.msgOnlyYou();
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    names,
  );
}

/** A day on the school's clock, as `YYYY-MM-DD`, for grouping messages. */
export function dayOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** The time today, the day this week, the date before that. */
export function whenShort(iso: string, today: string, timeZone: string) {
  const at = new Date(iso);
  const day = dayOf(iso, timeZone);
  const options: Intl.DateTimeFormatOptions =
    day === today
      ? { hour: "numeric", minute: "2-digit" }
      : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat(getLocale(), { ...options, timeZone }).format(
    at,
  );
}

export function timeOf(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function dayHeading(day: string, today: string) {
  if (day === today) return m.msgToday();
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
