import * as v from "valibot";

/** 0 = Sunday. The Egyptian school week runs Sunday to Thursday. */
export const SCHOOL_WEEKDAYS = [0, 1, 2, 3, 4] as const;
export type SchoolWeekday = (typeof SCHOOL_WEEKDAYS)[number];

const id = v.pipe(v.string(), v.uuid());
const clock = v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/));

export const timetableSlotSchema = v.pipe(
  v.object({
    weekday: v.picklist(SCHOOL_WEEKDAYS),
    startTime: clock,
    endTime: clock,
    subjectId: id,
    /** Empty falls back to the teacher responsible for the subject in the class. */
    teacherId: v.optional(v.union([v.literal(""), id]), ""),
    room: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32)), ""),
  }),
  v.forward(
    v.check((value) => value.endTime > value.startTime, "validation.end_time"),
    ["endTime"],
  ),
);
export type TimetableSlotInput = v.InferInput<typeof timetableSlotSchema>;

interface Span {
  weekday: number;
  startTime: string;
  endTime: string;
}

export function slotsCollide(a: Span, b: Span): boolean {
  return (
    a.weekday === b.weekday &&
    a.startTime < b.endTime &&
    b.startTime < a.endTime
  );
}

/** Indexes of every slot that shares time with another slot in the same list. */
export function collidingSlots(slots: readonly Span[]): number[] {
  const hits = new Set<number>();
  slots.forEach((slot, index) => {
    slots.forEach((other, otherIndex) => {
      if (index !== otherIndex && slotsCollide(slot, other)) hits.add(index);
    });
  });
  return [...hits].toSorted((a, b) => a - b);
}

export const saveTimetableSchema = v.pipe(
  v.object({
    classId: id,
    expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    slots: v.pipe(v.array(timetableSlotSchema), v.maxLength(80)),
  }),
  v.forward(
    v.check(
      (value) => collidingSlots(value.slots).length === 0,
      "validation.slot_overlap",
    ),
    ["slots"],
  ),
);
export type SaveTimetableInput = v.InferInput<typeof saveTimetableSchema>;

export const timetableQuerySchema = v.object({ classId: id });
