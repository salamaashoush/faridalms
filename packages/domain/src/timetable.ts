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
