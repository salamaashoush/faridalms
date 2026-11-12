import type { ClassLabel } from "@faridalms/database/stores/classes";
import type { LessonChange } from "@faridalms/database/stores/cover";
import type { MeetingRow } from "@faridalms/database/stores/timetable";

import { changesOn } from "@faridalms/database/stores/cover";
import { teachingPeriodsOn } from "@faridalms/database/stores/day-plan";
import {
  meetingsOn,
  studentClasses,
} from "@faridalms/database/stores/timetable";
import { isoWeekday } from "@faridalms/domain/school-days";

import type { UnitContext } from "../core/context";
import type { RecordLink } from "../core/reach";

import { contributionsTo, point } from "../core/extension";
import { clockOf, readProcedure, requireCapability } from "../core/procedure";
import { recordLinks } from "../core/reach";
import { learnerOfToday, todaySchema } from "../people/today";

export type RegisterState = "not_started" | "in_progress" | "submitted";

/**
 * What the registers say of a teacher's lessons today: each lesson's
 * register, by `classId:periodId`, and the registers they owe without a
 * lesson on the timetable, as a class's daily register.
 */
export interface LessonMarks {
  marksOn(
    context: UnitContext,
    input: { day: string; teacherId: string },
  ): Promise<{
    states: ReadonlyMap<string, RegisterState>;
    owed: {
      classId: string;
      classCode: string;
      classTitleEn: string | null;
      classTitleAr: string | null;
      periodId: string;
    }[];
  }>;
}

export const lessonMarks = point<LessonMarks>("lesson marks");

interface Slot {
  periodId: string;
  periodCode: string;
  periodNameEn: string | null;
  periodNameAr: string | null;
  startTime: string | null;
  endTime: string | null;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  roomCode: string | null;
  teacherId: string | null;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  /** How far the viewer reaches whoever teaches it, for a link on the name. */
  teacherLink: RecordLink;
  /** Whether this is the lesson on now, or the next one today. */
  when: "now" | "next" | null;
  register: RegisterState | null;
}

const slotKey = (row: { classId: string; periodId: string }) =>
  `${row.classId}:${row.periodId}`;

/**
 * A day's lessons as they are held: cancelled ones gone, and covered or
 * moved ones with that day's teacher and room. With `coverId`, a teacher's
 * day: lessons someone else covers for them are gone, and the lessons they
 * cover are added.
 */
async function asHeld(
  context: UnitContext,
  meetings: MeetingRow[],
  day: string,
  coverId?: string,
): Promise<MeetingRow[]> {
  const [changes, covers] = await Promise.all([
    changesOn(context.tx, {
      tenantId: context.tenantId,
      days: [day],
      filter: { classIds: [...new Set(meetings.map((row) => row.classId))] },
    }),
    coverId
      ? changesOn(context.tx, {
          tenantId: context.tenantId,
          days: [day],
          filter: { coverId },
        })
      : Promise.resolve([]),
  ]);
  const held = (row: MeetingRow, change: LessonChange | undefined) => {
    if (!change) return [row];
    if (change.cancelled) return [];
    if (coverId && change.coverId && change.coverId !== coverId) return [];
    return [
      {
        ...row,
        ...(change.coverId
          ? {
              teacherId: change.coverId,
              teacherNameEn: change.coverNameEn,
              teacherNameAr: change.coverNameAr,
            }
          : {}),
        ...(change.roomId
          ? {
              roomId: change.roomId,
              roomCode: change.roomCode,
              roomNameEn: change.roomNameEn,
              roomNameAr: change.roomNameAr,
            }
          : {}),
      },
    ];
  };
  const changeOf = new Map(changes.map((row) => [slotKey(row), row]));
  const own = meetings.flatMap((row) => held(row, changeOf.get(slotKey(row))));
  if (covers.length === 0) return own;
  const coverOf = new Map(covers.map((row) => [slotKey(row), row]));
  const covered = await meetingsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    on: day,
    days: [day],
    filter: {
      classIds: [...new Set(covers.map((row) => row.classId))],
    },
  });
  return [
    ...own,
    ...covered.flatMap((row) => {
      const change = coverOf.get(slotKey(row));
      return change ? held(row, change) : [];
    }),
  ];
}

/**
 * A day's lessons in period order, with the one on now and the next one
 * marked from the school's own clock.
 */
async function slotsOf(
  context: UnitContext,
  meetings: MeetingRow[],
  registerOf: (classId: string, periodId: string) => Slot["register"],
): Promise<Slot[]> {
  const [periods, clock] = await Promise.all([
    teachingPeriodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      day: context.today,
    }),
    clockOf(context),
  ]);
  const byId = new Map(periods.map((period) => [period.id, period]));
  const slots = meetings
    .flatMap((meeting) => {
      const period = byId.get(meeting.periodId);
      if (!period) return [];
      return [
        {
          periodId: period.id,
          periodCode: period.code,
          periodNameEn: period.nameEn,
          periodNameAr: period.nameAr,
          startTime: period.startTime,
          endTime: period.endTime,
          classId: meeting.classId,
          classCode: meeting.classCode,
          classTitleEn: meeting.classTitleEn,
          classTitleAr: meeting.classTitleAr,
          roomCode: meeting.roomCode,
          teacherId: meeting.teacherId,
          teacherNameEn: meeting.teacherNameEn,
          teacherNameAr: meeting.teacherNameAr,
          teacherLink: null as RecordLink,
          when: null as Slot["when"],
          register: registerOf(meeting.classId, period.id),
          sequence: period.sequence,
        },
      ];
    })
    .toSorted((a, b) => a.sequence - b.sequence);
  const on = slots.find(
    (slot) => slot.startTime <= clock && clock < slot.endTime,
  );
  const next = slots.find((slot) => slot.startTime > clock);
  return slots.map(({ sequence: _sequence, ...slot }) => ({
    ...slot,
    when: slot === on ? "now" : slot === next ? "next" : null,
  }));
}

/** A teacher's lessons today with each register's state, and the registers they owe without a lesson. */
async function teachingSlots(context: UnitContext): Promise<Slot[]> {
  const teacherId = context.actor.userId;
  const meetings = await asHeld(
    context,
    await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
      days: [context.today],
      filter: { teacherId },
    }),
    context.today,
    teacherId,
  );
  const marks = await Promise.all(
    (await contributionsTo(context, lessonMarks)).map((each) =>
      each.marksOn(context, { day: context.today, teacherId }),
    ),
  );
  const held = new Set(meetings.map(slotKey));
  // A daily register is expected without a timetabled lesson.
  const owed: MeetingRow[] = marks
    .flatMap((each) => each.owed)
    .filter((row) => !held.has(slotKey(row)))
    .map((row) => ({
      id: slotKey(row),
      classId: row.classId,
      classCode: row.classCode,
      classTitleEn: row.classTitleEn,
      classTitleAr: row.classTitleAr,
      timetableId: "",
      weekday: isoWeekday(context.today),
      periodId: row.periodId,
      teacherId,
      teacherNameEn: null,
      teacherNameAr: null,
      roomId: null,
      roomCode: null,
      roomNameEn: null,
      roomNameAr: null,
      from: context.today,
      on: context.today,
      clashAccepted: false,
      clashing: false,
      oneDay: false,
    }));
  return slotsOf(
    context,
    [...meetings, ...owed],
    (classId, periodId) =>
      marks
        .map((each) => each.states.get(`${classId}:${periodId}`))
        .find((state) => state !== undefined) ?? null,
  );
}

/** A learner's lessons today, each teacher named as far as the viewer reaches them. */
async function learnerSlots(
  context: UnitContext,
  studentId: string,
): Promise<Slot[]> {
  const classIds = await studentClasses(context.tx, {
    tenantId: context.tenantId,
    studentId,
    on: context.today,
  });
  const meetings =
    classIds.length > 0
      ? await asHeld(
          context,
          await meetingsOn(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            on: context.today,
            days: [context.today],
            filter: { classIds },
          }),
          context.today,
        )
      : [];
  const slots = await slotsOf(context, meetings, () => null);
  const linkOf = await recordLinks(
    context,
    slots.map((slot) => slot.teacherId),
  );
  return slots.map((slot) => ({
    ...slot,
    teacherLink: linkOf(slot.teacherId),
  }));
}

/** The classes of a learner's lessons today, in the order they meet. */
export async function learnerClassesToday(
  context: UnitContext,
  studentId: string,
): Promise<ClassLabel[]> {
  const classes = new Map<string, ClassLabel>();
  for (const slot of await learnerSlots(context, studentId))
    if (!classes.has(slot.classId))
      classes.set(slot.classId, {
        id: slot.classId,
        code: slot.classCode,
        titleEn: slot.classTitleEn,
        titleAr: slot.classTitleAr,
      });
  return [...classes.values()];
}

/**
 * Today's lessons for Today: a teacher's own with their registers, or a
 * learner's, the viewer's own or one they follow, with the lesson on now
 * and the next marked.
 */
export const today = readProcedure
  .input(todaySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:read", "children:read");
    const learner = await learnerOfToday(context, input.studentId);
    return {
      today: context.today,
      slots: learner
        ? await learnerSlots(context, learner)
        : await teachingSlots(context),
    };
  });
