import type { LessonChange } from "@faridalms/database/stores/cover";
import type { TimetableRow } from "@faridalms/database/stores/day-plan";
import type { MeetingRow } from "@faridalms/database/stores/timetable";

import { classById, roomsOf } from "@faridalms/database/stores/classes";
import { changesOn } from "@faridalms/database/stores/cover";
import {
  dayPlan,
  dayPlans,
  timetablesOf,
} from "@faridalms/database/stores/day-plan";
import { periodsInForce } from "@faridalms/database/stores/periods";
import { dayMarks, schoolWeek } from "@faridalms/database/stores/school-days";
import {
  bookingsAt,
  clipCell,
  copyMeetings,
  endCell,
  endMeetings,
  ensureTimetable,
  gridClasses,
  gridOwners,
  insertMeeting,
  lockGrid,
  insertTimetable,
  lockTimetables,
  meetingsOn,
  tombstoneTimetable,
  studentClasses,
  TimetableConflict,
  timetableLessons,
  teachingStaff,
  updateTimetable,
} from "@faridalms/database/stores/timetable";
import {
  copiedDays,
  cycleDays,
  timetableOn,
  weekdayOfCycleDay,
} from "@faridalms/domain/cycle";
import { dayWithin } from "@faridalms/domain/school";
import { schoolDays, weekDates } from "@faridalms/domain/school-days";
import {
  clashCheckSchema,
  classWeekSchema,
  clearSchema,
  gridQuerySchema,
  placeSchema,
  removeTimetableSchema,
  roomWeekSchema,
  saveTimetableSchema,
  studentWeekSchema,
  teacherWeekSchema,
  timetableOptionsSchema,
  WEEKLY,
} from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { classViewOf, settlementOf } from "../classes/points";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  reachesClass,
  reachesStudent,
  recordLinks,
  teaches,
} from "../core/reach";
import {
  gridClassIds,
  gridLessonClassIds,
  gridOwnerOf,
  gridsOf,
  plannedElsewhere,
} from "../timetable/grids";

const scope = (context: UnitContext) => ({
  tenantId: context.tenantId,
  schoolId: context.schoolId,
});

function timetableView(row: TimetableRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    startsOn: row.startsOn,
    kind: row.kind,
    length: row.length,
    firstDay: row.firstDay,
    closuresMove: row.closuresMove,
  };
}

/**
 * The periods and days a dated week is drawn with: each date with what the
 * school calendar marks it as, the day of its timetable's cycle, the bell
 * schedule it runs on and the lesson periods it holds at that day's times,
 * with the periods of its schedule's own, and the day of the cycle it runs
 * as when it is not its own. Rows are the week's periods by code, so a
 * period changed mid-week stays one row, labelled with its own times.
 */
async function frame(context: UnitContext, on: string) {
  const week = await schoolWeek(context.tx, context.tenantId, context.schoolId);
  const days = schoolDays(week.weekStart, week.weekendDays);
  const dated = weekDates(on, week.weekStart, days);
  const [plans, marked] = await Promise.all([
    dayPlans(context.tx, {
      ...scope(context),
      days: [on, ...dated.map((row) => row.date)],
    }),
    dayMarks(context.tx, {
      ...scope(context),
      from: dated[0]?.date ?? on,
      to: dated.at(-1)?.date ?? on,
    }),
  ]);
  const lessonsOn = (day: string) =>
    plans
      .get(day)
      ?.periods.filter(
        (period) => period.kind === "lesson" || period.scheduleId !== null,
      ) ?? [];
  const rows = new Map<string, ReturnType<typeof lessonsOn>[number]>();
  for (const day of [on, ...dated.map((row) => row.date)])
    for (const period of lessonsOn(day))
      if (!rows.has(period.code)) rows.set(period.code, period);
  return {
    on,
    today: context.today,
    timetable: timetableView(plans.get(on)?.timetable ?? null),
    days,
    dates: dated.map(({ day, date }) => {
      const mark = marked.find((row) => row.day === date);
      const plan = plans.get(date);
      return {
        day,
        date,
        meaning: mark?.meaning ?? null,
        closed: !(plan?.open ?? false),
        noteEn: mark?.noteEn ?? null,
        noteAr: mark?.noteAr ?? null,
        cycleDay: plan?.cycleDay ?? null,
        runsAs: plan?.runsAs ?? null,
        cycle: plan?.timetable
          ? { kind: plan.timetable.kind, length: plan.timetable.length }
          : null,
        schedule: plan?.schedule
          ? { nameEn: plan.schedule.nameEn, nameAr: plan.schedule.nameAr }
          : null,
        periods: lessonsOn(date).map((period) => ({
          id: period.id,
          code: period.code,
          startTime: period.startTime,
          endTime: period.endTime,
        })),
      };
    }),
    periods: [...rows.values()]
      .toSorted(
        (a, b) =>
          a.sequence - b.sequence ||
          a.ownStartTime.localeCompare(b.ownStartTime),
      )

      .map((period) => ({
        id: period.id,
        code: period.code,
        nameEn: period.nameEn,
        nameAr: period.nameAr,
        startTime: period.ownStartTime,
        endTime: period.ownEndTime,
        weekdays: period.weekdays,
      })),
  };
}

/**
 * What a planner places lessons in on a day: the timetable followed then,
 * the days of its cycle, and the lesson periods in force with the days of
 * the cycle each can meet on.
 */
async function cycleFrame(context: UnitContext, on: string) {
  const [week, plan, periods, timetables] = await Promise.all([
    schoolWeek(context.tx, context.tenantId, context.schoolId),
    dayPlan(context.tx, { ...scope(context), day: on }),
    periodsInForce(context.tx, { ...scope(context), on }),
    timetablesOf(context.tx, scope(context)),
  ]);
  const cycle = plan.timetable ?? WEEKLY;
  const days = cycleDays(cycle, schoolDays(week.weekStart, week.weekendDays));
  return {
    on,
    today: context.today,
    timetable: timetableView(plan.timetable),
    timetables: timetables.map((row) => ({
      id: row.id,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      startsOn: row.startsOn,
      kind: row.kind,
      length: row.length,
    })),
    days,
    periods: periods
      .filter((period) => period.kind === "lesson")
      .map((period) => ({
        id: period.id,
        code: period.code,
        nameEn: period.nameEn,
        nameAr: period.nameAr,
        startTime: period.startTime,
        endTime: period.endTime,
        weekdays: days.filter((day) => {
          const weekday = weekdayOfCycleDay(cycle, day);
          return weekday === null || period.weekdays.includes(weekday);
        }),
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
    timetableId: row.timetableId,
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
    oneDay: row.oneDay,
  };
}

const lessonKey = (row: { classId: string; periodId: string }, day: string) =>
  `${row.classId}:${row.periodId}:${day}`;

function changeView(change: LessonChange | undefined) {
  if (!change) return null;
  return {
    coverId: change.coverId,
    coverNameEn: change.coverNameEn,
    coverNameAr: change.coverNameAr,
    roomId: change.roomId,
    roomCode: change.roomCode,
    roomNameEn: change.roomNameEn,
    roomNameAr: change.roomNameAr,
    cancelled: change.cancelled,
    note: change.note,
  };
}

/**
 * A dated week's meetings with each one's change for its day. A teacher's
 * week also holds the lessons they cover, marked as covers.
 */
/**
 * A week's lessons with how far the viewer reaches the teacher each shows,
 * the one covering it where someone does.
 */
async function weekLessons(
  context: UnitContext,
  meetings: MeetingRow[],
  days: readonly string[],
  coverId?: string,
) {
  const lessons = await lessonsOfWeek(context, meetings, days, coverId);
  const shown = (lesson: (typeof lessons)[number]) =>
    lesson.change?.coverId ?? lesson.teacherId;
  const linkOf = await recordLinks(context, lessons.map(shown));
  return lessons.map((lesson) => ({
    ...lesson,
    teacherLink: linkOf(shown(lesson)),
  }));
}

async function lessonsOfWeek(
  context: UnitContext,
  meetings: MeetingRow[],
  days: readonly string[],
  coverId?: string,
) {
  const [changes, covers] = await Promise.all([
    changesOn(context.tx, {
      tenantId: context.tenantId,
      days,
      filter: { classIds: [...new Set(meetings.map((row) => row.classId))] },
    }),
    coverId
      ? changesOn(context.tx, {
          tenantId: context.tenantId,
          days,
          filter: { coverId },
        })
      : Promise.resolve([]),
  ]);
  const changeOf = new Map(
    changes.map((row) => [lessonKey(row, row.day), row]),
  );
  const lessons = meetings.map((row) => ({
    ...meetingView(row),
    change: changeView(changeOf.get(lessonKey(row, row.on))),
    cover: false,
  }));
  if (covers.length === 0) return lessons;
  const covered = new Map(covers.map((row) => [lessonKey(row, row.day), row]));
  const taken = await meetingsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    on: days[0] ?? context.today,
    days,
    filter: {
      classIds: [...new Set(covers.map((row) => row.classId))],
    },
  });
  return [
    ...lessons,
    ...taken
      .filter((row) => covered.has(lessonKey(row, row.on)))
      .map((row) => ({
        ...meetingView(row),
        change: changeView(covered.get(lessonKey(row, row.on))),
        cover: true,
      })),
  ];
}

/** The class whose grid a class is planned in, and the classes that grid places. */
async function gridClass(context: UnitContext, classId: string) {
  const ownerId = await gridOwnerOf(context, classId);
  const row = await classById(context.tx, context, ownerId);
  if (!row) throw new ORPCError("NOT_FOUND");
  const [placed, shown] = await Promise.all([
    gridClassIds(context, row.id),
    gridLessonClassIds(context, row.id),
  ]);
  return { owner: row, classIds: placed, lessonClassIds: shown };
}

/**
 * Where the grids start: every class that owns its grid, running from the
 * day viewed on, or of the view a module offers (a school year, say).
 */
export const options = readProcedure
  .input(timetableOptionsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const view = await classViewOf(context, input.views);
    const on = view?.on ?? context.today;
    const from = { from: on, to: null };
    const [grids, rooms, teachers] = await Promise.all([
      gridOwners(context.tx, {
        ...scope(context),
        during: view ? { only: view.classIds } : from,
        except: await plannedElsewhere(context, from),
      }),
      roomsOf(context.tx, context.tenantId, context.schoolId),
      teachingStaff(context.tx, { ...scope(context), during: from }),
    ]);
    return { today: context.today, on, grids, rooms, teachers };
  });

/** One grid's week as of a day, with the classes it can place. */
export const grid = readProcedure
  .input(gridQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const { owner, classIds } = await gridClass(context, input.classId);
    const on = dayWithin(owner.runs, input.on || context.today);
    const [shape, classes, meetings, settled] = await Promise.all([
      cycleFrame(context, on),
      gridClasses(context.tx, {
        tenantId: context.tenantId,
        classIds,
        on,
      }),
      meetingsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        on,
        filter: { classIds },
      }),
      settlementOf(context, owner.id),
    ]);
    return {
      ...shape,
      class: {
        id: owner.id,
        code: owner.code,
        titleEn: owner.titleEn,
        titleAr: owner.titleAr,
        runs: owner.runs,
      },
      canPlan: settled === null,
      classes,
      meetings: meetings.map(meetingView),
    };
  });

/** Who else a teacher or room is booked with at a time, before placing. */
export const check = readProcedure
  .input(clashCheckSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const { lessonClassIds } = await gridClass(context, input.classId);
    const plan = await dayPlan(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      day: input.from,
    });
    if (!plan.timetable) return { bookings: [] };
    return {
      bookings: await bookingsAt(context.tx, {
        tenantId: context.tenantId,
        timetableId: plan.timetable.id,
        gridClassIds: lessonClassIds,
        weekday: input.weekday,
        periodId: input.periodId,
        from: input.from,
        teacherId: input.teacherId || null,
        roomId: input.roomId || null,
      }),
    };
  });

/**
 * Where a placement from a day lands: the timetable followed then, made
 * when the school has none yet, refused for a class some module has
 * settled, a day after the class ends, a day of no school, or a period not
 * held on that day of the cycle.
 */
async function placementOn(
  context: UnitContext,
  owner: { id: string; runs: { from: string; to: string | null } },
  input: { weekday: number; periodId: string; from: string },
) {
  const settled = await settlementOf(context, owner.id);
  if (settled) throw new ORPCError("CONFLICT", { message: settled });
  if (owner.runs.to !== null && input.from >= owner.runs.to)
    throw new ORPCError("BAD_REQUEST", { message: "timetable.class_ended" });
  await ensureTimetable(context.tx, {
    ...scope(context),
    startsOn: input.from,
  });
  const shape = await cycleFrame(context, input.from);
  if (!shape.timetable || !shape.days.includes(input.weekday))
    throw new ORPCError("BAD_REQUEST", { message: "timetable.not_school_day" });
  if (
    !shape.periods.some(
      (period) =>
        period.id === input.periodId && period.weekdays.includes(input.weekday),
    )
  )
    throw new ORPCError("BAD_REQUEST", { message: "timetable.no_period" });
  return { timetableId: shape.timetable.id };
}

/** Puts a class in a cell from a day on, settling any clash as asked. */
export const place = writeProcedure
  .input(placeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const { owner, classIds, lessonClassIds } = await gridClass(
      context,
      input.classId,
    );
    const { timetableId } = await placementOn(context, owner, input);
    await lockGrid(context.tx, context.tenantId, owner.id);
    await clipCell(context.tx, {
      tenantId: context.tenantId,
      timetableId,
      weekday: input.weekday,
      periodId: input.periodId,
    });
    const placed = classIds.includes(input.meetingClassId)
      ? await classById(context.tx, context, input.meetingClassId)
      : null;
    if (!placed)
      throw new ORPCError("BAD_REQUEST", { message: "timetable.not_in_group" });
    if (placed.runs.to !== null && input.from >= placed.runs.to)
      throw new ORPCError("BAD_REQUEST", { message: "timetable.class_ended" });
    if (input.teacherId) {
      const teachers = await teachingStaff(context.tx, {
        ...scope(context),
        during: { from: input.from, to: null },
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
      timetableId,
      gridClassIds: lessonClassIds,
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
      timetableId,
      gridClassIds: lessonClassIds,
      weekday: input.weekday,
      periodId: input.periodId,
      from: input.from,
    });
    const meetingId = await insertMeeting(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      classId: placed.id,
      timetableId,
      weekday: input.weekday,
      periodId: input.periodId,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
      from: input.from > placed.runs.from ? input.from : placed.runs.from,
      endsBefore: placed.runs.to,
      clashAccepted: bookings.length > 0 && input.resolve === "keep",
    });
    await audit(context, {
      action: "timetable.place",
      objectType: "class_meeting",
      objectId: meetingId,
      details: {
        timetableId,
        gridClassId: owner.id,
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
    const { owner, lessonClassIds } = await gridClass(context, input.classId);
    const { timetableId } = await placementOn(context, owner, input);
    await lockGrid(context.tx, context.tenantId, owner.id);
    const ended = await endCell(context.tx, {
      tenantId: context.tenantId,
      timetableId,
      gridClassIds: lessonClassIds,
      weekday: input.weekday,
      periodId: input.periodId,
      from: input.from,
    });
    await audit(context, {
      action: "timetable.clear",
      objectType: "class",
      objectId: owner.id,
      details: {
        timetableId,
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
    const on = input.on || context.today;
    const [shape, rows] = await Promise.all([
      cycleFrame(context, on),
      meetingsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        on,
        filter: { schoolId: context.schoolId, clashesOnly: true },
      }),
    ]);
    const clashing = rows.filter((row) => row.clashing);
    const grids = await gridsOf(
      context,
      clashing.map((row) => row.classId),
    );
    return {
      on,
      timetable: shape.timetable,
      periods: shape.periods,
      rows: clashing.map((row) => {
        const owner = grids.get(row.classId);
        return {
          ...meetingView(row),
          gridClassId: owner?.id ?? row.classId,
          gridCode: owner?.code ?? row.classCode,
          gridTitleEn: owner?.titleEn ?? row.classTitleEn,
          gridTitleAr: owner?.titleAr ?? row.classTitleAr,
        };
      }),
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
    const on = input.on || context.today;
    const shape = await frame(context, on);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on,
      days: shape.dates.map((row) => row.date),
      filter: { teacherId },
    });
    return {
      week: {
        ...shape,
        meetings: await weekLessons(
          context,
          meetings,
          shape.dates.map((row) => row.date),
          teacherId,
        ),
      },
    };
  });

export const roomWeek = readProcedure
  .input(roomWeekSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const on = input.on || context.today;
    const shape = await frame(context, on);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on,
      days: shape.dates.map((row) => row.date),
      filter: { roomId: input.roomId },
    });
    return {
      week: {
        ...shape,
        meetings: await weekLessons(
          context,
          meetings,
          shape.dates.map((row) => row.date),
        ),
      },
    };
  });

/** A student's week: their own, a child's, or any student staff reach. */
export const studentWeek = readProcedure
  .input(studentWeekSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:read");
    const studentId = input.studentId || context.actor.userId;
    if (
      studentId !== context.actor.userId &&
      !(await reachesStudent(context, "timetable", studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const on = input.on || context.today;
    const [shape, classIds] = await Promise.all([
      frame(context, on),
      studentClasses(context.tx, {
        tenantId: context.tenantId,
        studentId,
        on,
      }),
    ]);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on,
      days: shape.dates.map((row) => row.date),
      filter: { classIds },
    });
    return {
      week: {
        ...shape,
        meetings: await weekLessons(
          context,
          meetings,
          shape.dates.map((row) => row.date),
        ),
      },
    };
  });

/** A class's week for its record: the lessons its grid places. */
export const classWeek = readProcedure
  .input(classWeekSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:read");
    const row = await classById(context.tx, context, input.classId);
    if (!row) throw new ORPCError("NOT_FOUND");
    const on = dayWithin(row.runs, input.on || context.today);
    if (
      !(await teaches(context, "timetable", row.id)) &&
      !(await reachesClass(context, "timetable", row.id, on))
    )
      throw new ORPCError("NOT_FOUND");
    const [shape, settled] = await Promise.all([
      frame(context, on),
      settlementOf(context, row.id),
    ]);
    const meetings = await meetingsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on,
      days: shape.dates.map((day) => day.date),
      filter: { classIds: await gridLessonClassIds(context, row.id) },
    });
    return {
      week: {
        ...shape,
        meetings: await weekLessons(
          context,
          meetings,
          shape.dates.map((day) => day.date),
        ),
      },
      canPlan: can(context, "timetable:manage") && settled === null,
      gridClassId: await gridOwnerOf(context, row.id),
    };
  });

/**
 * The school's timetables in the order they are followed, each with the
 * day the next takes over, how its lessons repeat and how many it places.
 */
export const timetables = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "timetable:manage");
  const [week, rows] = await Promise.all([
    schoolWeek(context.tx, context.tenantId, context.schoolId),
    timetablesOf(context.tx, scope(context)),
  ]);
  const lessons = await timetableLessons(context.tx, {
    tenantId: context.tenantId,
    ids: rows.map((row) => row.id),
  });
  return {
    today: context.today,
    days: schoolDays(week.weekStart, week.weekendDays),
    timetables: rows.map((row, index) => ({
      ...(timetableView(row) as NonNullable<ReturnType<typeof timetableView>>),
      version: row.version,
      from: row.startsOn,
      until: rows[index + 1]?.startsOn ?? null,
      first: index === 0,
      started: row.startsOn <= context.today,
      lessons: lessons.get(row.id) ?? 0,
    })),
  };
});

function timetableRefused(error: unknown): never {
  if (error instanceof TimetableConflict)
    throw new ORPCError("CONFLICT", { message: error.code });
  throw error;
}

/**
 * Adds a timetable from a date, starting with the lessons of the one it
 * follows or with none, or changes one. A timetable already followed keeps
 * its cycle and start while it places lessons, so the days it ran read as
 * they were; a new one starts today at the earliest.
 */
export const saveTimetable = writeProcedure
  .input(saveTimetableSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    await lockTimetables(context.tx, scope(context));
    const rows = await timetablesOf(context.tx, scope(context));
    const first = rows[0];
    const fields = {
      tenantId: context.tenantId,
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      startsOn: input.startsOn,
      kind: input.kind,
      length: input.length,
      firstDay: input.firstDay,
      closuresMove: input.closuresMove,
    };
    if (!first) {
      if (input.id) throw new ORPCError("NOT_FOUND");
      const id = await insertTimetable(context.tx, {
        ...fields,
        schoolId: context.schoolId,
      });
      await audit(context, {
        action: "timetable.create",
        objectType: "timetable",
        objectId: id,
        change: {
          table: "core.timetables",
          before: null,
          after: { ...input, id: undefined },
        },
        details: { copiedFrom: null, copied: 0 },
      });
      return { id, copied: 0 };
    }
    const firstStart = first.startsOn;
    const later = (startsOn: string, except: string | null) => {
      if (
        startsOn <= firstStart ||
        startsOn < context.today ||
        rows.some((row) => row.id !== except && row.startsOn === startsOn)
      )
        throw new ORPCError("BAD_REQUEST", { message: "timetable.start" });
    };
    if (input.id) {
      const current = rows.find((row) => row.id === input.id);
      if (!current) throw new ORPCError("NOT_FOUND");
      const isFirst = current.id === first.id;
      if (isFirst && input.startsOn !== current.startsOn)
        throw new ORPCError("BAD_REQUEST", {
          message: "timetable.first_fixed",
        });
      const lessons =
        (
          await timetableLessons(context.tx, {
            tenantId: context.tenantId,
            ids: [current.id],
          })
        ).get(current.id) ?? 0;
      const started = current.startsOn <= context.today;
      if (
        lessons > 0 &&
        (input.kind !== current.kind || input.length !== current.length)
      )
        throw new ORPCError("CONFLICT", { message: "timetable.cycle_in_use" });
      if (
        lessons > 0 &&
        started &&
        (input.startsOn !== current.startsOn ||
          input.firstDay !== current.firstDay ||
          input.closuresMove !== current.closuresMove)
      )
        throw new ORPCError("CONFLICT", { message: "timetable.started" });
      if (!isFirst && input.startsOn !== current.startsOn)
        later(input.startsOn, current.id);
      await updateTimetable(context.tx, {
        ...fields,
        id: current.id,
        version: input.version ?? 0,
      }).catch(timetableRefused);
      await audit(context, {
        action: "timetable.update",
        objectType: "timetable",
        objectId: current.id,
        change: {
          table: "core.timetables",
          before: timetableView(current),
          after: { ...input, id: undefined },
        },
      });
      return { id: current.id, copied: 0 };
    }
    later(input.startsOn, null);
    const before = timetableOn(rows, input.startsOn);
    const days =
      input.start === "copy" && before ? copiedDays(before, input) : null;
    if (input.start === "copy" && !days)
      throw new ORPCError("BAD_REQUEST", { message: "timetable.cannot_copy" });
    const id = await insertTimetable(context.tx, {
      ...fields,
      schoolId: context.schoolId,
    });
    const copied =
      before && days
        ? await copyMeetings(context.tx, {
            tenantId: context.tenantId,
            fromId: before.id,
            toId: id,
            startsOn: input.startsOn,
            days,
          })
        : 0;
    await audit(context, {
      action: "timetable.create",
      objectType: "timetable",
      objectId: id,
      change: {
        table: "core.timetables",
        before: null,
        after: input,
      },
      details: { copiedFrom: days ? before?.id : null, copied },
    });
    return { id, copied };
  });

/**
 * Removes a timetable not yet followed, with its lessons; the one before
 * it carries on in its place. The school's first always stays.
 */
export const removeTimetable = writeProcedure
  .input(removeTimetableSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    await lockTimetables(context.tx, scope(context));
    const rows = await timetablesOf(context.tx, scope(context));
    const current = rows.find((row) => row.id === input.id);
    if (!current) throw new ORPCError("NOT_FOUND");
    if (rows[0]?.id === current.id)
      throw new ORPCError("BAD_REQUEST", { message: "timetable.first_fixed" });
    const lessons =
      (
        await timetableLessons(context.tx, {
          tenantId: context.tenantId,
          ids: [current.id],
        })
      ).get(current.id) ?? 0;
    if (lessons > 0 && current.startsOn <= context.today)
      throw new ORPCError("CONFLICT", { message: "timetable.started" });
    await tombstoneTimetable(context.tx, {
      tenantId: context.tenantId,
      id: current.id,
      version: input.version,
    }).catch(timetableRefused);
    await audit(context, {
      action: "timetable.remove",
      objectType: "timetable",
      objectId: current.id,
      change: {
        table: "core.timetables",
        before: timetableView(current),
        after: null,
      },
      details: { lessons },
    });
    return { lessons };
  });
