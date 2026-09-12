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

export type Stage = "early_years" | "primary" | "middle";

export const STAGE_LABEL: Record<Stage, () => string> = {
  early_years: m.adminStageEarlyYears,
  primary: m.adminStagePrimary,
  middle: m.adminStageMiddle,
};

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

export function studentName(student: {
  firstName: string;
  lastName: string;
}): string {
  return `${student.firstName} ${student.lastName}`;
}

/**
 * Relations come back nullable from the query builder even where the column is
 * `NOT NULL`, so every caller has to be able to say "not recorded" instead.
 * Only the timetable selects `nameAr`; the other queries send `name` alone.
 */
export function subjectName(
  subject: { name: string; nameAr?: string } | null | undefined,
): string | undefined {
  if (!subject) {
    return undefined;
  }
  return getLocale() === "ar" && subject.nameAr ? subject.nameAr : subject.name;
}

export function percentOf(done: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export interface SubmissionCount {
  state: "not_started" | "draft" | "submitted" | "returned";
}

/** Handed in means the student let go of it: submitted, or already returned. */
export function handedInCount(submissions: SubmissionCount[]): number {
  return submissions.filter(
    (row) => row.state === "submitted" || row.state === "returned",
  ).length;
}
