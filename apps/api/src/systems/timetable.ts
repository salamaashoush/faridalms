import type { Scope } from "@faridalms/database/stores/students";
import type { MeetingRow } from "@faridalms/database/stores/timetable";
import type { SchoolYear } from "@faridalms/database/stores/years";

import { periodsOn } from "@faridalms/database/stores/attendance";
import {
  classById,
  reachesClass,
  roomsOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import {
  bookingsAt,
  endCell,
  endMeetings,
  gridOwners,
  groupClasses,
  insertMeeting,
  meetingsOn,
  studentGroups,
  yearTeachers,
} from "@faridalms/database/stores/timetable";
import {
  calendarDays,
  dayIn,
  holdYear,
  schoolWeek,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";
import { addDays } from "@faridalms/domain/school";
import {
  clashCheckSchema,
  classWeekSchema,
  clearSchema,
  gridQuerySchema,
  placeSchema,
  roomWeekSchema,
  schoolDays,
  studentWeekSchema,
  teacherWeekSchema,
  weekDates,
} from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide:
      can(context, "timetable:manage") || can(context, "classes:manage"),
  };
}

async function currentYear(context: UnitContext) {
  return workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
}

async function yearById(context: UnitContext, yearId: string) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return years.find((row) => row.id === yearId) ?? null;
}

/**
 * The periods and days a week is drawn with, on the day it is read, and the
 * date of each day with what the school calendar marks it as.
 */
async function frame(context: UnitContext, year: SchoolYear, on: string) {
  const week = await schoolWeek(context.tx, context.tenantId, context.schoolId);
  const days = schoolDays(week.weekStart, week.weekendDays);
  const dated = weekDates(on, week.weekStart, days);
  const [periods, marked] = await Promise.all([
    periodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: on,
    }),
    calendarDays(context.tx, {
      tenantId: context.tenantId,
      yearId: year.id,
      from: dated[0]?.date ?? on,
      to: dated.at(-1)?.date ?? on,
    }),
  ]);
  return {
    on,
    today: context.today,
    year: {
      id: year.id,
      startsOn: year.startsOn,
      lastDay: addDays(year.endsBefore, -1),
      closed: year.lifecycle === "closed",
    },
    days,
    dates: dated.map(({ day, date }) => {
      const mark = marked.find((row) => row.day === date);
      const outside = date < year.startsOn || date >= year.endsBefore;
      return {
        day,
        date,
        meaning: outside ? "outside_year" : (mark?.meaning ?? null),
        closed:
          outside ||
          (mark !== undefined && !SCHOOL_DAY_MEANINGS.includes(mark.meaning)),
        noteEn: mark?.noteEn ?? null,
        noteAr: mark?.noteAr ?? null,
      };
    }),
    periods: periods
      .filter((period) => period.kind === "lesson")
      .map((period) => ({
        id: period.id,
        code: period.code,
        nameEn: period.nameEn,
        nameAr: period.nameAr,
        startTime: period.startTime,
        endTime: period.endTime,
      })),
  };
}

function meetingView(row: MeetingRow) {
  return {
    id: row.id,
    classId: row.classId,
    classCode: row.classCode,
    classTitleEn: row.classTitleEn,
    classTitleAr: row.classTitleAr,
    groupClassId: row.groupClassId,
    groupCode: row.groupCode,
    groupTitleEn: row.groupTitleEn,
    groupTitleAr: row.groupTitleAr,
    weekday: row.weekday,
    periodId: row.periodId,
    teacherId: row.teacherId,
    teacherNameEn: row.teacherNameEn,
    teacherNameAr: row.teacherNameAr,
    roomId: row.roomId,
    roomCode: row.roomCode,
    roomNameEn: row.roomNameEn,
    roomNameAr: row.roomNameAr,
    from: row.from,
    on: row.on,
    clashAccepted: row.clashAccepted,
    clashing: row.clashing,
  };
}

/** A grid's owner: a homeroom, or a class no homeroom holds. */
async function gridClass(context: UnitContext, classId: string) {
  const row = await classById(context.tx, context, classId);
  if (!row) throw new ORPCError("NOT_FOUND");
  if (row.classType === "scheduled" && row.homeroomClassId) {
    const homeroom = await classById(context.tx, context, row.homeroomClassId);
    if (!homeroom) throw new ORPCError("NOT_FOUND");
    return homeroom;
  }
  return row;
}

/** Where the grids start: the school's homerooms and its classes of their own. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "timetable:manage");
  const year = await currentYear(context);
  if (!year)
    return {
      year: null,
      grids: [],
      rooms: [],
      teachers: [],
      today: context.today,
    };
  const [grids, rooms, teachers] = await Promise.all([
    gridOwners(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
    }),
    roomsOf(context.tx, context.tenantId, context.schoolId),
    yearTeachers(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
    }),
  ]);
  return {
    today: context.today,
    year: {
      id: year.id,
      startsOn: year.startsOn,
      lastDay: addDays(year.endsBefore, -1),
      closed: year.lifecycle === "closed",
    },
    grids,
    rooms,
    teachers,
  };
});

/** One homeroom's week as of a day, with the classes it can place. */
export const grid = readProcedure
  .input(gridQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const owner = await gridClass(context, input.classId);
    const year = await yearById(context, owner.schoolYearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    const on = dayIn(year, input.on || context.today);
    const [shape, classes, meetings] = await Promise.all([
      frame(context, year, on),
      groupClasses(context.tx, {
        tenantId: context.tenantId,
        groupId: owner.id,
        on,
      }),
      meetingsOn(context.tx, {
        tenantId: context.tenantId,
        on,
        filter: { groupIds: [owner.id] },
      }),
    ]);
    return {
      ...shape,
      class: {
        id: owner.id,
        code: owner.code,
        titleEn: owner.titleEn,
        titleAr: owner.titleAr,
        classType: owner.classType,
      },
      classes,
      meetings: meetings.map(meetingView),
    };
  });

/** Who else a teacher or room is booked with at a time, before placing. */
export const check = readProcedure
  .input(clashCheckSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const owner = await gridClass(context, input.classId);
    return {
      bookings: await bookingsAt(context.tx, {
        tenantId: context.tenantId,
        groupId: owner.id,
        weekday: input.weekday,
        periodId: input.periodId,
        from: input.from,
        teacherId: input.teacherId || null,
        roomId: input.roomId || null,
      }),
    };
  });

async function placementYear(
  context: UnitContext,
  owner: { schoolYearId: string },
  input: { weekday: number; periodId: string; from: string },
) {
  const lifecycle = await holdYear(
    context.tx,
    context.tenantId,
    owner.schoolYearId,
  );
  if (!lifecycle) throw new ORPCError("NOT_FOUND");
  if (lifecycle === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  const year = await yearById(context, owner.schoolYearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  if (input.from < year.startsOn || input.from >= year.endsBefore)
    throw new ORPCError("BAD_REQUEST", { message: "timetable.outside_year" });
  const shape = await frame(context, year, input.from);
  if (!shape.days.includes(input.weekday as never))
    throw new ORPCError("BAD_REQUEST", { message: "timetable.not_school_day" });
  if (!shape.periods.some((period) => period.id === input.periodId))
    throw new ORPCError("BAD_REQUEST", { message: "timetable.no_period" });
  return year;
}

/** Puts a class in a cell from a day on, settling any clash as asked. */
export const place = writeProcedure
  .input(placeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const owner = await gridClass(context, input.classId);
    const year = await placementYear(context, owner, input);
    const classes = await groupClasses(context.tx, {
      tenantId: context.tenantId,
      groupId: owner.id,
      on: input.from,
    });
    const placed = classes.find((row) => row.id === input.meetingClassId);
    if (!placed)
      throw new ORPCError("BAD_REQUEST", { message: "timetable.not_in_group" });
    if (input.teacherId) {
      const teachers = await yearTeachers(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
      });
      if (!teachers.some((row) => row.userId === input.teacherId))
        throw new ORPCError("BAD_REQUEST", { message: "timetable.teacher" });
    }
    if (input.roomId) {
      const rooms = await roomsOf(
        context.tx,
        context.tenantId,
        context.schoolId,
      );
      if (!rooms.some((row) => row.id === input.roomId))
        throw new ORPCError("BAD_REQUEST", { message: "timetable.room" });
    }
    const bookings = await bookingsAt(context.tx, {
      tenantId: context.tenantId,
      groupId: owner.id,
      weekday: input.weekday,
      periodId: input.periodId,
      from: input.from,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
    });
    if (bookings.length && input.resolve === "ask")
      throw new ORPCError("CONFLICT", { message: "timetable.busy" });
    if (bookings.length && input.resolve === "move")
      await endMeetings(context.tx, {
        tenantId: context.tenantId,
        ids: bookings.map((row) => row.id),
        from: input.from,
      });
    await endCell(context.tx, {
      tenantId: context.tenantId,
      groupId: owner.id,
      weekday: input.weekday,
      periodId: input.periodId,
      from: input.from,
    });
    const meetingId = await insertMeeting(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      classId: placed.id,
      classType: "scheduled",
      yearId: year.id,
      groupId: owner.id,
      weekday: input.weekday,
      periodId: input.periodId,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
      from: input.from,
      endsBefore: year.endsBefore,
      clashAccepted: bookings.length > 0 && input.resolve === "keep",
    });
    await audit(context, {
      action: "timetable.place",
      objectType: "class_meeting",
      objectId: meetingId,
      details: {
        groupClassId: owner.id,
        classId: placed.id,
        weekday: input.weekday,
        periodId: input.periodId,
        from: input.from,
        resolved: bookings.length ? input.resolve : null,
        moved: input.resolve === "move" ? bookings.map((row) => row.id) : [],
      },
    });
    return { id: meetingId };
  });

/** Empties a cell from a day on; the days before keep their class. */
export const clear = writeProcedure
  .input(clearSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const owner = await gridClass(context, input.classId);
    await placementYear(context, owner, input);
    const ended = await endCell(context.tx, {
      tenantId: context.tenantId,
      groupId: owner.id,
      weekday: input.weekday,
      periodId: input.periodId,
      from: input.from,
    });
    await audit(context, {
      action: "timetable.clear",
      objectType: "class",
      objectId: owner.id,
      details: {
        weekday: input.weekday,
        periodId: input.periodId,
        from: input.from,
      },
    });
    return { ended };
  });

/** Clashes someone chose to keep, so they are not forgotten. */
export const clashes = readProcedure
  .input(
    v.object({
      on: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
        "",
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const year = await currentYear(context);
    if (!year) return { on: context.today, periods: [], rows: [] };
    const on = dayIn(year, input.on || context.today);
    const [shape, rows] = await Promise.all([
      frame(context, year, on),
      meetingsOn(context.tx, {
        tenantId: context.tenantId,
        on,
        filter: { schoolId: context.schoolId, clashesOnly: true },
      }),
    ]);
    return {
      on,
      periods: shape.periods,
      rows: rows.filter((row) => row.clashing).map(meetingView),
    };
  });

/** A teacher's week: their own, or anyone's for those who plan the timetable. */
export const teacherWeek = readProcedure
  .input(teacherWeekSchema)
  .handler(async ({ input, context }) => {
    const teacherId = input.teacherId || context.actor.userId;
    if (teacherId === context.actor.userId)
      requireCapability(context, "timetable:read");
    else requireCapability(context, "timetable:manage");
    const year = await currentYear(context);
    if (!year) return { week: null };
    const on = dayIn(year, input.on || context.today);
    const shape = await frame(context, year, on);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      on,
      days: shape.dates.map((row) => row.date),
      filter: { teacherId },
    });
    return { week: { ...shape, meetings: meetings.map(meetingView) } };
  });

export const roomWeek = readProcedure
  .input(roomWeekSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const year = await currentYear(context);
    if (!year) return { week: null };
    const on = dayIn(year, input.on || context.today);
    const shape = await frame(context, year, on);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      on,
      days: shape.dates.map((row) => row.date),
      filter: { roomId: input.roomId },
    });
    return { week: { ...shape, meetings: meetings.map(meetingView) } };
  });

/** A student's week: their own, a child's, or any student staff reach. */
export const studentWeek = readProcedure
  .input(studentWeekSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:read");
    const studentId = input.studentId || context.actor.userId;
    if (
      studentId !== context.actor.userId &&
      !(await isVisibleStudent(context.tx, scopeOf(context), studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const year = await currentYear(context);
    if (!year) return { week: null };
    const on = dayIn(year, input.on || context.today);
    const [shape, groups] = await Promise.all([
      frame(context, year, on),
      studentGroups(context.tx, {
        tenantId: context.tenantId,
        studentId,
        on,
      }),
    ]);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      on,
      days: shape.dates.map((row) => row.date),
      filter: groups,
    });
    return { week: { ...shape, meetings: meetings.map(meetingView) } };
  });

/** A class's week for its record: a homeroom's lessons, or one class's. */
export const classWeek = readProcedure
  .input(classWeekSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:read");
    const row = await classById(context.tx, context, input.classId);
    if (!row) throw new ORPCError("NOT_FOUND");
    const year = await yearById(context, row.schoolYearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    const on = dayIn(year, input.on || context.today);
    if (
      !(await teachesClass(context.tx, scopeOf(context), row.id)) &&
      !(await reachesClass(context.tx, scopeOf(context), row.id, on))
    )
      throw new ORPCError("NOT_FOUND");
    const shape = await frame(context, year, on);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      on,
      days: shape.dates.map((day) => day.date),
      filter:
        row.classType === "homeroom"
          ? { groupIds: [row.id] }
          : { groupIds: [], classIds: [row.id] },
    });
    return {
      week: { ...shape, meetings: meetings.map(meetingView) },
      canPlan: can(context, "timetable:manage") && year.lifecycle !== "closed",
      gridClassId: row.homeroomClassId ?? row.id,
    };
  });
