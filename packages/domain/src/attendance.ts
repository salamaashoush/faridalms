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

/** What a family reports: a child away, arriving late, or leaving early. */
export const ABSENCE_REPORT_KINDS = ["absent", "late", "early"] as const;
export type AbsenceReportKind = (typeof ABSENCE_REPORT_KINDS)[number];

/** What came of trying to reach a family about an absence. */
export const CONTACT_OUTCOMES = [
  "reached",
  "no_answer",
  "left_message",
  "messaged",
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

/** School days an unexplained absence may wait for its reason (DfE: 5). */
export const REASON_DUE_DAYS = 5;

export type AbsenceReportStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "withdrawn";

export interface AttendanceSettings {
  /** How many days back a teacher may still change a register. */
  teacherEditDays: number;
  /** How long an unexcused absence waits before families are told. */
  noticeDelayMinutes: number;
  /** The share of sessions missed at which a student counts as chronically absent. */
  chronicPercent: number;
  /** Ways children may mark themselves in, for the teacher to confirm. */
  checkInTouch: boolean;
  checkInQr: boolean;
  checkInNfc: boolean;
  /** Minutes after a period starts before an arrival counts as late. */
  lateAfterMinutes: number;
  /**
   * Minutes after a period starts when its register closes. England's
   * guidance holds it to 30 at most; a later arrival is late after close.
   */
  registerClosesMinutes: number;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  teacherEditDays: 14,
  noticeDelayMinutes: 60,
  chronicPercent: 10,
  checkInTouch: false,
  checkInQr: false,
  checkInNfc: false,
  lateAfterMinutes: 5,
  registerClosesMinutes: 30,
};

const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/**
 * How late an arrival at `clock` is for a period starting at `start`, or
 * null while it is within the school's grace.
 */
export function minutesLate(
  start: string,
  clock: string,
  graceMinutes: number,
): number | null {
  const late = minutesOf(clock) - minutesOf(start);
  return late > graceMinutes ? late : null;
}

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

/** How far back a family may still report a day, as a note sent after it. */
export const REPORT_DAYS_BACK = 14;

const optionalId = v.optional(v.union([v.literal(""), id]), "");

/**
 * A family's report: the days a child is away, or the day and time they
 * arrive late or leave early, with a reason the school's codes name.
 */
export const absenceReportSchema = v.pipe(
  v.object({
    studentId: id,
    kind: v.picklist(ABSENCE_REPORT_KINDS),
    from: isoDate,
    to: isoDate,
    at: v.optional(
      v.union([v.literal(""), v.pipe(v.string(), v.isoTime())]),
      "",
    ),
    reasonId: id,
    note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000)), ""),
    fileId: optionalId,
  }),
  v.check((input) => input.from <= input.to, "attendance.range"),
  v.check(
    (input) =>
      input.kind === "absent"
        ? input.at === ""
        : input.at !== "" && input.from === input.to,
    "attendance.report_time",
  ),
);
export type AbsenceReportInput = v.InferOutput<typeof absenceReportSchema>;

export const familyReportsSchema = v.object({ studentId: optionalId });

export const withdrawReportSchema = v.object({ id });

export const reportInboxSchema = v.object({
  open: v.optional(v.boolean(), true),
});

export const decideReportSchema = v.object({
  id,
  decision: v.picklist(["accepted", "declined"]),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
});
export type DecideReport = v.InferOutput<typeof decideReportSchema>;

export const followUpQuerySchema = v.object({
  date: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const logContactSchema = v.object({
  studentId: id,
  date: isoDate,
  outcome: v.picklist(CONTACT_OUTCOMES),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
});
export type LogContact = v.InferOutput<typeof logContactSchema>;

export const attendanceSettingsSchema = v.pipe(
  v.object({
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
    checkInTouch: v.optional(v.boolean(), false),
    checkInQr: v.optional(v.boolean(), false),
    checkInNfc: v.optional(v.boolean(), false),
    lateAfterMinutes: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(60)),
      DEFAULT_ATTENDANCE_SETTINGS.lateAfterMinutes,
    ),
    registerClosesMinutes: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(240)),
      DEFAULT_ATTENDANCE_SETTINGS.registerClosesMinutes,
    ),
  }),
  v.check(
    (input) => input.lateAfterMinutes < input.registerClosesMinutes,
    "attendance.lateness",
  ),
);

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

/** How a child marks themselves in: on the class screen, by badge QR or by card. */
export const CHECK_IN_WAYS = ["touch", "qr", "nfc"] as const;
export type CheckInWay = (typeof CHECK_IN_WAYS)[number];

/** A child marking themselves in: by tapping their name, or by their badge's secret. */
export const checkInSchema = v.pipe(
  v.object({
    classId: id,
    date: isoDate,
    periodId: id,
    via: v.picklist(CHECK_IN_WAYS),
    studentId: v.optional(id),
    badge: v.optional(v.pipe(v.string(), v.minLength(16), v.maxLength(200))),
  }),
  v.check(
    (input) =>
      input.via === "touch"
        ? input.studentId !== undefined
        : input.badge !== undefined,
    "attendance.check_in_who",
  ),
);

export const undoCheckInSchema = v.object({
  classId: id,
  date: isoDate,
  periodId: id,
  studentId: id,
});
