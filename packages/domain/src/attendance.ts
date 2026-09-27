import * as v from "valibot";

import { addDays } from "./school";

/**
 * The fixed meanings of `attendance_category` descriptors. A school may add
 * its own categories, but each one means one of these.
 */
export const ATTENDANCE_MEANINGS = [
  "present",
  "absent",
  "late",
  "excused",
  "left_early",
] as const;
export type AttendanceMeaning = (typeof ATTENDANCE_MEANINGS)[number];

/** Marks that count against attendance; the rest mean the student was there. */
export const ABSENT_MEANINGS: readonly AttendanceMeaning[] = [
  "absent",
  "excused",
];

/** Marks that take minutes: how late, or how early the student left. */
export const TIMED_MEANINGS: readonly AttendanceMeaning[] = [
  "late",
  "left_early",
];

export type RegisterState = "not_started" | "in_progress" | "submitted";

export interface AttendanceSettings {
  /** How many days back a teacher may still change a register. */
  teacherEditDays: number;
  /** How long an unexcused absence waits before families are told. */
  noticeDelayMinutes: number;
  /** The share of sessions missed at which a student counts as chronically absent. */
  chronicPercent: number;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  teacherEditDays: 14,
  noticeDelayMinutes: 60,
  chronicPercent: 10,
};

const id = v.pipe(v.string(), v.uuid());
const isoDate = v.pipe(v.string(), v.isoDate());
const note = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), "");

export const registerMarkSchema = v.pipe(
  v.object({
    studentId: id,
    meaning: v.picklist(ATTENDANCE_MEANINGS),
    reasonId: v.optional(v.union([v.literal(""), id]), ""),
    minutes: v.optional(
      v.nullable(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(600)),
      ),
      null,
    ),
    note,
  }),
  v.forward(
    v.check(
      (mark) => mark.minutes === null || TIMED_MEANINGS.includes(mark.meaning),
      "attendance.minutes_not_timed",
    ),
    ["minutes"],
  ),
);
export type RegisterMark = v.InferOutput<typeof registerMarkSchema>;

export const saveRegisterSchema = v.pipe(
  v.object({
    classId: id,
    date: isoDate,
    periodId: id,
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    marks: v.pipe(v.array(registerMarkSchema), v.maxLength(300)),
  }),
  v.check(
    (input) =>
      new Set(input.marks.map((mark) => mark.studentId)).size ===
      input.marks.length,
    "attendance.duplicate_student",
  ),
);
export type SaveRegister = v.InferOutput<typeof saveRegisterSchema>;

export const registerQuerySchema = v.object({
  classId: id,
  date: isoDate,
  periodId: v.optional(v.union([v.literal(""), id]), ""),
});

export const dayQuerySchema = v.object({
  date: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const absencesQuerySchema = v.object({
  from: v.optional(v.union([v.literal(""), isoDate]), ""),
  to: v.optional(v.union([v.literal(""), isoDate]), ""),
  show: v.optional(v.picklist(["unexplained", "all"]), "unexplained"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type AbsencesQuery = v.InferOutput<typeof absencesQuerySchema>;

export const reportQuerySchema = v.object({
  periodId: v.optional(v.union([v.literal(""), id]), ""),
  by: v.optional(v.picklist(["student", "class"]), "student"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type ReportQuery = v.InferOutput<typeof reportQuerySchema>;

export const excuseSchema = v.object({
  marks: v.pipe(
    v.array(v.object({ id, date: isoDate })),
    v.minLength(1),
    v.maxLength(200),
  ),
  reasonId: id,
  note,
});
export type Excuse = v.InferOutput<typeof excuseSchema>;

export const attendanceSettingsSchema = v.object({
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  teacherEditDays: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(60),
  ),
  noticeDelayMinutes: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(1440),
  ),
  chronicPercent: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(50),
  ),
});

/** Whether a teacher may still change a register taken on `date`. */
export function teacherMayEdit(
  date: string,
  today: string,
  editDays: number,
): boolean {
  return date <= today && date >= addDays(today, -editDays);
}

/** A register is submitted once every student on the roster has a mark. */
export function registerState(
  roster: readonly string[],
  marked: ReadonlySet<string>,
): Exclude<RegisterState, "not_started"> {
  return roster.length > 0 && roster.every((student) => marked.has(student))
    ? "submitted"
    : "in_progress";
}

/** An absence or late arrival nobody has given a reason for yet. */
export function isUnexplained(
  meaning: AttendanceMeaning,
  reasonId: string | null,
): boolean {
  return (meaning === "absent" || meaning === "late") && !reasonId;
}

export type AttendanceCounts = Record<AttendanceMeaning, number>;

export function emptyCounts(): AttendanceCounts {
  return { present: 0, absent: 0, late: 0, excused: 0, left_early: 0 };
}

export interface AttendanceSummary extends AttendanceCounts {
  sessions: number;
  /** Share of sessions attended, 0 to 100, or null before any were taken. */
  rate: number | null;
}

export function summarise(counts: AttendanceCounts): AttendanceSummary {
  const sessions = ATTENDANCE_MEANINGS.reduce(
    (total, meaning) => total + counts[meaning],
    0,
  );
  const missed = counts.absent + counts.excused;
  return {
    ...counts,
    sessions,
    rate:
      sessions === 0
        ? null
        : Math.round(((sessions - missed) / sessions) * 1000) / 10,
  };
}

/** Missing at least the school's share of sessions, once any were taken. */
export function isChronic(
  summary: AttendanceSummary,
  chronicPercent: number,
): boolean {
  return summary.rate !== null && 100 - summary.rate >= chronicPercent;
}

export const remindSchema = v.object({
  date: isoDate,
  classIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(100)),
});
