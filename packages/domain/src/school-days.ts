import * as v from "valibot";

import { addDays, daysBetween } from "./school";

/** ISO weekdays, 1 for Monday to 7 for Sunday, as `core.orgs` stores them. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isoWeekday(iso: string): IsoWeekday {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** The school's week: the day it starts on and the days it rests. */
export interface SchoolWeek {
  weekStart: number;
  weekendDays: readonly number[];
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

/** Day meanings on which lessons are held; everything else keeps the school shut. */
export const SCHOOL_DAY_MEANINGS: readonly string[] = [
  "instructional_day",
  "exam_day",
  "early_dismissal",
  "make_up_day",
];

/**
 * Whether lessons are held on a day: by the school's week where the school
 * marked nothing, else by what it marked.
 */
export function dayOpen(
  week: SchoolWeek,
  day: string,
  meaning: string | null,
): boolean {
  if (meaning === null) return !week.weekendDays.includes(isoWeekday(day));
  return SCHOOL_DAY_MEANINGS.includes(meaning);
}

/** Whether a day is one of the week's rest days that the school left unmarked. */
export const dayRests = (
  week: SchoolWeek,
  day: string,
  meaning: string | null,
) => meaning === null && week.weekendDays.includes(isoWeekday(day));

/** How many days of `[from, endsBefore)` hold lessons, given what the school marked. */
export function schoolDayCount(
  week: SchoolWeek,
  span: { from: string; endsBefore: string },
  meaningOf: (day: string) => string | null,
): number {
  let count = 0;
  for (let day = span.from; day < span.endsBefore; day = addDays(day, 1))
    if (dayOpen(week, day, meaningOf(day))) count += 1;
  return count;
}

/**
 * What a range of days can be marked as. `normal` takes the marks away, so
 * each day is a school day or a weekend by the school's week; a make-up day
 * may land on a weekend, every other kind leaves an unmarked weekend as it is.
 */
export const DAY_KINDS = [
  "normal",
  "public_holiday",
  "school_holiday",
  "exam_day",
  "teacher_only_day",
  "early_dismissal",
  "make_up_day",
  "weather_closure",
  "emergency_closure",
  "other",
] as const;
export type DayKind = (typeof DAY_KINDS)[number];

/** Whether marking a range as `kind` changes this day of it. */
export function paintReaches(
  week: SchoolWeek,
  kind: DayKind,
  day: string,
  meaning: string | null,
): boolean {
  if (kind === "normal") return meaning !== null;
  return kind === "make_up_day" || !dayRests(week, day, meaning);
}

/** The longest range one change marks: a year of days. */
export const MAX_PAINT_DAYS = 366;

const isoDate = v.pipe(v.string(), v.isoDate());
const note = v.pipe(v.string(), v.trim(), v.maxLength(200));

export const paintDaysSchema = v.pipe(
  v.object({
    from: isoDate,
    to: isoDate,
    kind: v.picklist(DAY_KINDS),
    noteEn: note,
    noteAr: note,
    provisional: v.boolean(),
  }),
  v.forward(
    v.check(
      (input) =>
        input.to >= input.from &&
        daysBetween(input.from, input.to) < MAX_PAINT_DAYS,
      "calendar.range",
    ),
    ["to"],
  ),
);
export type PaintDays = v.InferOutput<typeof paintDaysSchema>;

/** The longest window the school's days are read over at once. */
export const MAX_DAYS_WINDOW = 400;

export const schoolDaysQuerySchema = v.pipe(
  v.object({ from: isoDate, to: isoDate }),
  v.forward(
    v.check(
      (input) =>
        input.to >= input.from &&
        daysBetween(input.from, input.to) < MAX_DAYS_WINDOW,
      "calendar.range",
    ),
    ["to"],
  ),
);
