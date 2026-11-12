import * as v from "valibot";

import type { IsoWeekday } from "./school-days";

import { viewsSchema } from "./classes";
import { daysBetween } from "./school";
import { MAX_PAINT_DAYS, schoolDaysQuerySchema } from "./school-days";

/**
 * How a timetable's lessons repeat. A cycle of weeks repeats whole weeks
 * (one for an ordinary week, two for A/B weeks); its days are numbered week
 * by week, so the fourth day of the second week is 7 + 4. A cycle of days
 * numbers school days 1 to its length and starts again, whatever weekday
 * each falls on.
 */
export const CYCLE_KINDS = ["weeks", "days"] as const;
export type CycleKind = (typeof CYCLE_KINDS)[number];

export const MAX_CYCLE_WEEKS = 4;
export const MIN_CYCLE_DAYS = 2;
export const MAX_CYCLE_DAYS = 20;
/** The highest day number any cycle has: the last day of four weeks. */
export const MAX_CYCLE_DAY = 7 * MAX_CYCLE_WEEKS;

export interface Cycle {
  kind: CycleKind;
  length: number;
  /** Where the cycle stands on the timetable's first school day: its week or day number. */
  firstDay: number;
  /**
   * A closed day or week does not use up a place in the cycle, so it picks
   * up where it stopped. Otherwise the cycle keeps to the calendar and a
   * closure loses its days.
   */
  closuresMove: boolean;
}

export const WEEKLY: Cycle = {
  kind: "weeks",
  length: 1,
  firstDay: 1,
  closuresMove: false,
};

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
/** A day of a timetable's cycle; a weekday in an ordinary week. */
const cycleDay = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_CYCLE_DAY),
);

/** The grids a planner starts from, narrowed by the views modules offer. */
export const timetableOptionsSchema = v.object({ views: viewsSchema });

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
  /** A class of the grid edited, which is planned in its owner's grid. */
  classId: id,
  /** The day of the timetable's cycle: a weekday in an ordinary week. */
  weekday: cycleDay,
  periodId: id,
  /** The first day the change applies; earlier days keep what they had. */
  from: isoDate,
};

export const placeSchema = v.object({
  ...cell,
  /** The class that meets in the cell: one the grid places. */
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
  v.check(
    (input) =>
      input.from <= input.to &&
      daysBetween(input.from, input.to) < MAX_PAINT_DAYS,
    "timetable.absence_range",
  ),
);
export type StaffAbsenceInput = v.InferOutput<typeof staffAbsenceSchema>;

export const removeAbsenceSchema = v.object({ id });

const lesson = {
  classId: id,
  periodId: id,
  on: isoDate,
};

/**
 * The change the sheet showed, or "" for none. A lesson's change is
 * replaced, never edited in place, so its id is what was shown.
 */
const expectedChange = { expected: v.union([v.literal(""), id]) };

export const coverOptionsSchema = v.object(lesson);

/**
 * One day's change to a lesson: someone covers it, it moves room, or it is
 * cancelled. A cancelled lesson has neither cover nor room.
 */
export const changeLessonSchema = v.pipe(
  v.object({
    ...lesson,
    ...expectedChange,
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

export const clearChangeSchema = v.object({ ...lesson, ...expectedChange });

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
  /** A daily register taken in it is the day's attendance. */
  official: boolean;
  /** The days of the week it runs on; the school's weekend never has it. */
  weekdays: readonly number[];
  /** Other times it keeps on some of those days, each day in one entry at most. */
  dayTimes: readonly DayTimes[];
}

/** The times a period keeps on some days of the week instead of its own. */
export interface DayTimes {
  weekdays: readonly number[];
  startTime: string;
  endTime: string;
}

/** A period's times on a day of the week, or null when it does not run then. */
export function timesOnWeekday(
  period: Pick<
    PeriodPattern,
    "startTime" | "endTime" | "weekdays" | "dayTimes"
  >,
  day: number,
): { startTime: string; endTime: string } | null {
  if (!period.weekdays.includes(day)) return null;
  const other = period.dayTimes.find((entry) => entry.weekdays.includes(day));
  return other
    ? { startTime: other.startTime, endTime: other.endTime }
    : { startTime: period.startTime, endTime: period.endTime };
}

/** The usual school day, which a school that has set none may start from. */
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
  dayTimes: [],
}));

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length &&
  a
    .toSorted((x, y) => x - y)
    .every((day, index) => day === b.toSorted((x, y) => x - y)[index]);

const sameDayTimes = (a: readonly DayTimes[], b: readonly DayTimes[]) =>
  a.length === b.length &&
  a.every((entry) =>
    b.some(
      (other) =>
        other.startTime === entry.startTime &&
        other.endTime === entry.endTime &&
        sameDays(other.weekdays, entry.weekdays),
    ),
  );

/** Whether two versions of a period differ in anything a day is drawn with. */
export function periodChanged(a: PeriodPattern, b: PeriodPattern): boolean {
  return (
    a.nameEn !== b.nameEn ||
    a.nameAr !== b.nameAr ||
    a.kind !== b.kind ||
    a.startTime !== b.startTime ||
    a.endTime !== b.endTime ||
    a.official !== b.official ||
    !sameDays(a.weekdays, b.weekdays) ||
    !sameDayTimes(a.dayTimes, b.dayTimes)
  );
}

export type PeriodIssue = "slot_overlap" | "official_twice";

/**
 * The first clash between periods that share a day, each at its times on
 * that day, or null when every day holds together.
 */
export function periodIssue(
  periods: readonly Pick<
    PeriodPattern,
    "startTime" | "endTime" | "official" | "weekdays" | "dayTimes"
  >[],
): PeriodIssue | null {
  for (const [index, one] of periods.entries())
    for (const other of periods.slice(index + 1))
      for (const day of EVERY_DAY) {
        const a = timesOnWeekday(one, day);
        const b = timesOnWeekday(other, day);
        if (!a || !b) continue;
        if (a.startTime < b.endTime && b.startTime < a.endTime)
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

const dayTimesSchema = v.pipe(
  v.object({
    weekdays: v.pipe(v.array(weekday), v.minLength(1), v.maxLength(7)),
    startTime: clock,
    endTime: clock,
  }),
  v.forward(
    v.check((value) => value.endTime > value.startTime, "validation.end_time"),
    ["endTime"],
  ),
);

/** Each day of the week in one entry at most, and only days the period runs on. */
function dayTimesFit(value: {
  weekdays: readonly number[];
  dayTimes: readonly DayTimes[];
}) {
  const days = value.dayTimes.flatMap((entry) => entry.weekdays);
  return (
    new Set(days).size === days.length &&
    days.every((day) => value.weekdays.includes(day))
  );
}

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
    dayTimes: v.optional(v.pipe(v.array(dayTimesSchema), v.maxLength(6)), []),
  }),
  v.forward(
    v.check((value) => dayTimesFit(value), "validation.day_times"),
    ["dayTimes"],
  ),
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
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

/**
 * The school's day from a date on: the periods it holds then, in any order,
 * replacing those in force on that date. `known` is every period the editor
 * read in force on that date, with the version it read.
 */
export const savePeriodsSchema = v.pipe(
  v.object({
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

const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const periodCode = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,20}$/));

/** Whether a cycle of this kind may have this length and start at this place. */
export function cycleFits(cycle: Pick<Cycle, "kind" | "length" | "firstDay">) {
  const [min, max] =
    cycle.kind === "weeks"
      ? [1, MAX_CYCLE_WEEKS]
      : [MIN_CYCLE_DAYS, MAX_CYCLE_DAYS];
  return (
    Number.isInteger(cycle.length) &&
    cycle.length >= min &&
    cycle.length <= max &&
    Number.isInteger(cycle.firstDay) &&
    cycle.firstDay >= 1 &&
    cycle.firstDay <= cycle.length
  );
}

/** A bell schedule's times for one period, named by the period's code. */
export interface BellTimes {
  code: string;
  startTime: string;
  endTime: string;
}

const bellTimesSchema = v.pipe(
  v.object({ code: periodCode, startTime: clock, endTime: clock }),
  v.forward(
    v.check((value) => value.endTime > value.startTime, "validation.end_time"),
    ["endTime"],
  ),
);

/** The most periods of its own a bell schedule adds to its days. */
export const MAX_EXTRA_PERIODS = 10;

/**
 * A period only a bell schedule's days hold, such as an assembly or an
 * exam slot. It is never the day's official register.
 */
export const extraPeriodSchema = v.pipe(
  v.object({
    /** The period this one carries on from; none for a new one. */
    id: v.optional(id),
    code: periodCode,
    nameEn: periodName,
    nameAr: periodName,
    kind: v.picklist(PERIOD_KINDS),
    startTime: clock,
    endTime: clock,
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
);
export type ExtraPeriodInput = v.InferOutput<typeof extraPeriodSchema>;

/**
 * A day run on other times: the periods it holds, each at its
 * time that day, and any periods of its own. A period it leaves out is not
 * held on its days.
 */
export const saveBellScheduleSchema = v.pipe(
  v.object({
    id: v.optional(id),
    version: v.optional(version),
    nameEn: periodName,
    nameAr: periodName,
    times: v.pipe(v.array(bellTimesSchema), v.maxLength(50)),
    extras: v.optional(
      v.pipe(v.array(extraPeriodSchema), v.maxLength(MAX_EXTRA_PERIODS)),
      [],
    ),
  }),
  v.forward(
    v.check(
      (value) => value.nameEn !== null || value.nameAr !== null,
      "validation.name_required",
    ),
    ["nameAr"],
  ),
  v.forward(
    v.check((value) => {
      const count = value.times.length + value.extras.length;
      return count > 0 && count <= 50;
    }, "validation.schedule_empty"),
    ["times"],
  ),
  v.forward(
    v.check((value) => {
      const held = [...value.times, ...value.extras];
      return new Set(held.map((row) => row.code)).size === held.length;
    }, "validation.schedule_code"),
    ["times"],
  ),
  v.forward(
    v.check(
      (value) =>
        periodIssue(
          [...value.times, ...value.extras].map((row) => ({
            startTime: row.startTime,
            endTime: row.endTime,
            official: false,
            weekdays: EVERY_DAY,
            dayTimes: [],
          })),
        ) === null,
      "validation.slot_overlap",
    ),
    ["times"],
  ),
);
export type SaveBellSchedule = v.InferOutput<typeof saveBellScheduleSchema>;

export const removeBellScheduleSchema = v.object({ id, version });

/** Runs a range of days on a bell schedule, or "" for their own times. */
export const scheduleDaysSchema = v.pipe(
  v.object({
    from: isoDate,
    to: isoDate,
    scheduleId: v.union([v.literal(""), id]),
  }),
  v.forward(
    v.check((value) => value.to >= value.from, "validation.end_date"),
    ["to"],
  ),
  v.forward(
    v.check(
      (value) => daysBetween(value.from, value.to) < MAX_PAINT_DAYS,
      "calendar.range",
    ),
    ["to"],
  ),
);
export type ScheduleDays = v.InferOutput<typeof scheduleDaysSchema>;

/**
 * Runs one date as another day of its timetable's cycle (a Tuesday as a
 * Monday, a day as Day 3), or as its own day again with null.
 */
export const runDayAsSchema = v.object({
  day: isoDate,
  runsAs: v.nullable(cycleDay),
});
export type RunDayAs = v.InferOutput<typeof runDayAsSchema>;

/** How a new timetable starts: with the lessons of the one before it, or with none. */
export const TIMETABLE_STARTS = ["copy", "empty"] as const;
export type TimetableStart = (typeof TIMETABLE_STARTS)[number];

const cycleLength = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_CYCLE_DAYS),
);

/**
 * A timetable of the school from a date on: its name, how its lessons repeat
 * and where the repeat stands on its first day.
 */
export const saveTimetableSchema = v.pipe(
  v.object({
    id: v.optional(id),
    version: v.optional(version),
    nameEn: periodName,
    nameAr: periodName,
    startsOn: isoDate,
    kind: v.picklist(CYCLE_KINDS),
    length: cycleLength,
    firstDay: v.optional(cycleLength, 1),
    closuresMove: v.optional(v.boolean(), false),
    start: v.optional(v.picklist(TIMETABLE_STARTS), "copy"),
  }),
  v.forward(
    v.check((value) => cycleFits(value), "validation.cycle"),
    ["length"],
  ),
);
export type SaveTimetable = v.InferOutput<typeof saveTimetableSchema>;

export const removeTimetableSchema = v.object({ id, version });

/** The days a school-days planner reads the timetable's part of. */
export const timetableDaysSchema = schoolDaysQuerySchema;
