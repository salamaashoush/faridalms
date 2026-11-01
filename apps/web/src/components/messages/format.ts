import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  formatDate,
  formatInstant,
  formatList,
  schoolDayOf,
} from "~/utils/datetime";

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
  return formatList(names);
}

/** The time today, the date before that, on the school's clock. */
export function whenShort(iso: string, today: string) {
  return formatInstant(iso, schoolDayOf(iso) === today ? "time" : "short");
}

export function dayHeading(day: string, today: string) {
  return day === today ? m.msgToday() : formatDate(day, "weekday");
}
