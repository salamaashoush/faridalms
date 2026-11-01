import * as v from "valibot";

import { addDays } from "./school";

/** ISO weekdays, 1 for Monday to 7 for Sunday, as `core.orgs` stores them. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isoWeekday(iso: string): IsoWeekday {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** The school's teaching days in week order, starting from its first day. */
export function schoolDays(
  weekStart: number,
  weekendDays: readonly number[],
): IsoWeekday[] {
  const days: IsoWeekday[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = (((weekStart - 1 + offset) % 7) + 1) as IsoWeekday;
    if (!weekendDays.includes(day)) days.push(day);
  }
  return days;
}

/** The date of each school day in the week holding `on`, in week order. */
export function weekDates(
  on: string,
  weekStart: number,
  days: readonly IsoWeekday[],
): { day: IsoWeekday; date: string }[] {
  const start = addDays(on, -((isoWeekday(on) - weekStart + 7) % 7));
  return days.map((day) => ({
    day,
    date: addDays(start, (day - weekStart + 7) % 7),
  }));
}

/**
 * How a placement meets a teacher or room already booked elsewhere at the
 * same time: refuse and ask, take them from the other class, or keep both
 * and flag the clash.
 */
export const CLASH_RESOLUTIONS = ["ask", "move", "keep"] as const;
export type ClashResolution = (typeof CLASH_RESOLUTIONS)[number];

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const isoDate = v.pipe(v.string(), v.isoDate());
const weekday = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7));

export const gridQuerySchema = v.object({
  classId: id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const weekQuerySchema = v.object({
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const teacherWeekSchema = v.object({
  teacherId: optionalId,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const roomWeekSchema = v.object({
  roomId: id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const studentWeekSchema = v.object({
  studentId: optionalId,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const classWeekSchema = v.object({
  classId: id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

const cell = {
  /** The class whose grid is edited: a homeroom, or a class of its own. */
  classId: id,
  weekday,
  periodId: id,
  /** The first day the change applies; earlier days keep what they had. */
  from: isoDate,
};

export const placeSchema = v.object({
  ...cell,
  /** The class that meets in the cell: one of the homeroom's subject classes. */
  meetingClassId: id,
  teacherId: optionalId,
  roomId: optionalId,
  resolve: v.optional(v.picklist(CLASH_RESOLUTIONS), "ask"),
});
export type Place = v.InferOutput<typeof placeSchema>;

export const clearSchema = v.object(cell);
export type ClearCell = v.InferOutput<typeof clearSchema>;

export const clashCheckSchema = v.object({
  ...cell,
  teacherId: optionalId,
  roomId: optionalId,
});

export const STAFF_ABSENCE_REASONS = [
  "illness",
  "training",
  "school_trip",
  "personal",
  "other",
] as const;
export type StaffAbsenceReason = (typeof STAFF_ABSENCE_REASONS)[number];

export const coverDaySchema = v.object({
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const staffAbsenceSchema = v.pipe(
  v.object({
    userId: id,
    from: isoDate,
    to: isoDate,
    /** The periods missed each day; none means whole days. */
    periodIds: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
    reason: v.picklist(STAFF_ABSENCE_REASONS),
    note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
  }),
  v.check((input) => input.from <= input.to, "timetable.absence_range"),
);
export type StaffAbsenceInput = v.InferOutput<typeof staffAbsenceSchema>;

export const removeAbsenceSchema = v.object({ id });

const lesson = {
  classId: id,
  periodId: id,
  on: isoDate,
};

export const coverOptionsSchema = v.object(lesson);

/**
 * One day's change to a lesson: someone covers it, it moves room, or it is
 * cancelled. A cancelled lesson has neither cover nor room.
 */
export const changeLessonSchema = v.pipe(
  v.object({
    ...lesson,
    coverId: optionalId,
    roomId: optionalId,
    cancelled: v.optional(v.boolean(), false),
    note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000)), ""),
  }),
  v.check(
    (input) =>
      input.cancelled
        ? !input.coverId && !input.roomId
        : Boolean(input.coverId || input.roomId),
    "timetable.change_shape",
  ),
);
export type ChangeLesson = v.InferOutput<typeof changeLessonSchema>;

export const clearChangeSchema = v.object(lesson);

export const PERIOD_KINDS = [
  "lesson",
  "registration",
  "break",
  "other",
] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const EVERY_DAY: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** A period of the school day as a year's structure holds it, apart from its dates. */
export interface PeriodPattern {
  nameEn: string | null;
  nameAr: string | null;
  kind: PeriodKind;
  startTime: string;
  endTime: string;
  /** Its register is the day's attendance for a homeroom. */
  official: boolean;
  /** The days of the week it runs on; the school's weekend never has it. */
  weekdays: readonly number[];
}

/** The day a school starts from when neither it nor its group has one. */
export const DEFAULT_PERIODS: readonly (PeriodPattern & { code: string })[] = [
  ["reg", "Registration", "التسجيل", "registration", "07:45", "08:00"],
  ["1", "Period 1", "الحصة الأولى", "lesson", "08:00", "08:45"],
  ["2", "Period 2", "الحصة الثانية", "lesson", "08:50", "09:35"],
  ["3", "Period 3", "الحصة الثالثة", "lesson", "09:40", "10:25"],
  ["break", "Break", "الفسحة", "break", "10:25", "10:55"],
  ["4", "Period 4", "الحصة الرابعة", "lesson", "10:55", "11:40"],
  ["5", "Period 5", "الحصة الخامسة", "lesson", "11:45", "12:30"],
  ["6", "Period 6", "الحصة السادسة", "lesson", "12:35", "13:20"],
].map(([code, nameEn, nameAr, kind, startTime, endTime]) => ({
  code: code ?? "",
  nameEn: nameEn ?? null,
  nameAr: nameAr ?? null,
  kind: kind as PeriodKind,
  startTime: startTime ?? "",
  endTime: endTime ?? "",
  official: kind === "registration",
  weekdays: EVERY_DAY,
}));

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length &&
  a
    .toSorted((x, y) => x - y)
    .every((day, index) => day === b.toSorted((x, y) => x - y)[index]);

/** Whether two versions of a period differ in anything a day is drawn with. */
export function periodChanged(a: PeriodPattern, b: PeriodPattern): boolean {
  return (
    a.nameEn !== b.nameEn ||
    a.nameAr !== b.nameAr ||
    a.kind !== b.kind ||
    a.startTime !== b.startTime ||
    a.endTime !== b.endTime ||
    a.official !== b.official ||
    !sameDays(a.weekdays, b.weekdays)
  );
}

export type PeriodIssue = "slot_overlap" | "official_twice";

/** The first clash between periods that share a day, or null when the day holds together. */
export function periodIssue(
  periods: readonly Pick<
    PeriodPattern,
    "startTime" | "endTime" | "official" | "weekdays"
  >[],
): PeriodIssue | null {
  for (const [index, one] of periods.entries())
    for (const other of periods.slice(index + 1)) {
      if (!one.weekdays.some((day) => other.weekdays.includes(day))) continue;
      if (one.startTime < other.endTime && other.startTime < one.endTime)
        return "slot_overlap";
      if (one.official && other.official) return "official_twice";
    }
  return null;
}

const clock = v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/));
const periodName = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(60),
    v.transform((value) => (value === "" ? null : value)),
  ),
  "",
);

export const periodSchema = v.pipe(
  v.object({
    /** The period this one carries on from; none for a period the day gains. */
    id: v.optional(id),
    nameEn: periodName,
    nameAr: periodName,
    kind: v.picklist(PERIOD_KINDS),
    startTime: clock,
    endTime: clock,
    official: v.optional(v.boolean(), false),
    weekdays: v.pipe(v.array(weekday), v.minLength(1), v.maxLength(7)),
  }),
  v.forward(
    v.check(
      (value) => value.nameEn !== null || value.nameAr !== null,
      "validation.name_required",
    ),
    ["nameAr"],
  ),
  v.forward(
    v.check((value) => value.endTime > value.startTime, "validation.end_time"),
    ["endTime"],
  ),
  v.forward(
    v.check(
      (value) => !value.official || value.kind !== "break",
      "validation.official_break",
    ),
    ["official"],
  ),
);
export type PeriodInput = v.InferOutput<typeof periodSchema>;

export const periodsQuerySchema = v.object({
  id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

/**
 * A year's day from a date on: the periods it holds then, in any order,
 * replacing those in force on that date. `known` is every period the editor
 * read in force on that date, with the version it read.
 */
export const savePeriodsSchema = v.pipe(
  v.object({
    yearId: id,
    from: isoDate,
    known: v.pipe(
      v.array(
        v.object({
          id,
          version: v.pipe(v.number(), v.integer(), v.minValue(1)),
        }),
      ),
      v.maxLength(50),
    ),
    periods: v.pipe(v.array(periodSchema), v.minLength(1), v.maxLength(20)),
  }),
  v.forward(
    v.check(
      (value) => periodIssue(value.periods) !== "slot_overlap",
      "validation.slot_overlap",
    ),
    ["periods"],
  ),
  v.forward(
    v.check(
      (value) => periodIssue(value.periods) !== "official_twice",
      "validation.official_twice",
    ),
    ["periods"],
  ),
);
export type SavePeriods = v.InferOutput<typeof savePeriodsSchema>;
