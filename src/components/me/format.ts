import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

/** 0 = Sunday, matching `timetable_slots.weekday` and the Egyptian school week. */
export const SCHOOL_WEEKDAYS = [0, 1, 2, 3, 4];

const WEEKDAY_LABEL = [
  m.daySunday,
  m.dayMonday,
  m.dayTuesday,
  m.dayWednesday,
  m.dayThursday,
];

export function weekdayLabel(weekday: number): string {
  const label = WEEKDAY_LABEL[weekday];
  return label ? label() : m.commonNotRecorded();
}

export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** `startTime` and `endTime` arrive as Postgres `time` strings, e.g. "08:00:00". */
export function formatTime(time: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`1970-01-01T${time}Z`));
}

export function formatPercent(whole: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(whole / 100);
}

export function subjectName(
  subject: { name: string; nameAr: string } | null | undefined,
): string | null {
  if (!subject) {
    return null;
  }
  return getLocale() === "ar" ? subject.nameAr : subject.name;
}

export function subjectIcon(
  subject: { icon: string } | null | undefined,
): string {
  return subject?.icon ?? "book-open";
}

export function percentOf(score: number, maxScore: number): number {
  if (maxScore <= 0) {
    return 0;
  }
  return Math.round((score / maxScore) * 100);
}
