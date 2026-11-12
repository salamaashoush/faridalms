import {
  BellScheduleConflict,
  extraPeriodsOf,
  insertBellSchedule,
  removeBellSchedule,
  runDayAs,
  scheduleDays,
  setExtraPeriods,
  timetableDays,
  updateBellSchedule,
} from "@faridalms/database/stores/bell-schedules";
import {
  bellSchedulesOf,
  dayPlan,
  timetablesOf,
} from "@faridalms/database/stores/day-plan";
import {
  PeriodChangeError,
  periodChangeDays,
  periodsInForce,
  replacePeriodsFrom,
} from "@faridalms/database/stores/periods";
import {
  markedMeanings,
  schoolWeek,
} from "@faridalms/database/stores/school-days";
import { cycleDays, timetableOn } from "@faridalms/domain/cycle";
import { addDays } from "@faridalms/domain/school";
import { dayRests, schoolDays } from "@faridalms/domain/school-days";
import {
  periodsQuerySchema,
  removeBellScheduleSchema,
  runDayAsSchema,
  saveBellScheduleSchema,
  savePeriodsSchema,
  scheduleDaysSchema,
  timetableDaysSchema,
} from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { firstPeriodUse } from "../timetable/period-uses";

const scope = (context: UnitContext) => ({
  tenantId: context.tenantId,
  schoolId: context.schoolId,
});

/**
 * The school's day as it stands on a date: its periods in order, the days
 * of the week they run on, the days the day changes shape on and the bell
 * schedules days may run on.
 */
export const periods = readProcedure
  .input(periodsQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage", "timetable:manage");
    const on = input.on || context.today;
    const [week, rows, changes, schedules] = await Promise.all([
      schoolWeek(context.tx, context.tenantId, context.schoolId),
      periodsInForce(context.tx, { ...scope(context), on }),
      periodChangeDays(context.tx, scope(context)),
      bellSchedulesOf(context.tx, scope(context)),
    ]);
    const extras = await extraPeriodsOf(context.tx, {
      tenantId: context.tenantId,
      scheduleIds: schedules.map((row) => row.id),
    });
    return {
      on,
      today: context.today,
      weekStart: week.weekStart,
      days: schoolDays(week.weekStart, week.weekendDays),
      changes,
      schedules: schedules.map((row) => ({
        id: row.id,
        version: row.version,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        times: row.times,
        extras: extras
          .filter((extra) => extra.scheduleId === row.id)
          .map((extra) => ({
            id: extra.id,
            code: extra.code,
            nameEn: extra.nameEn,
            nameAr: extra.nameAr,
            kind: extra.kind,
            startTime: extra.startTime,
            endTime: extra.endTime,
          })),
      })),
      periods: rows.map((row) => ({
        id: row.id,
        version: row.version,
        code: row.code,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        kind: row.kind,
        startTime: row.startTime,
        endTime: row.endTime,
        official: row.official,
        weekdays: [...row.weekdays],
        dayTimes: row.dayTimes.map((entry) => ({
          weekdays: [...entry.weekdays],
          startTime: entry.startTime,
          endTime: entry.endTime,
        })),
        from: row.from,
        until: row.until,
      })),
      canEdit: can(context, "timetable:manage"),
    };
  });

const periodView = (row: {
  nameEn: string | null;
  nameAr: string | null;
  kind: string;
  startTime: string;
  endTime: string;
  official: boolean;
  weekdays: readonly number[];
  dayTimes: readonly {
    weekdays: readonly number[];
    startTime: string;
    endTime: string;
  }[];
}) => ({
  nameEn: row.nameEn,
  nameAr: row.nameAr,
  kind: row.kind,
  startTime: row.startTime,
  endTime: row.endTime,
  official: row.official,
  weekdays: [...row.weekdays],
  ...(row.dayTimes.length
    ? {
        dayTimes: row.dayTimes.map((entry) => ({
          weekdays: [...entry.weekdays],
          startTime: entry.startTime,
          endTime: entry.endTime,
        })),
      }
    : {}),
});

/**
 * Sets the school's day from a date on. Earlier days keep the periods they
 * had, so registers already taken read as they were.
 */
export const savePeriods = writeProcedure
  .input(savePeriodsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const week = await schoolWeek(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const open = new Set<number>(schoolDays(week.weekStart, week.weekendDays));
    if (
      input.periods.some((period) =>
        period.weekdays.every((day) => !open.has(day)),
      )
    )
      throw new ORPCError("BAD_REQUEST", { message: "class_period.no_days" });
    const before = await periodsInForce(context.tx, {
      ...scope(context),
      on: input.from,
    });
    const outcome = await replacePeriodsFrom(context.tx, {
      ...scope(context),
      from: input.from,
      known: input.known,
      periods: input.periods,
      firstUse: (ids, from) => firstPeriodUse(context, ids, from),
    }).catch((error: unknown) => {
      if (error instanceof PeriodChangeError)
        throw new ORPCError("CONFLICT", { message: error.code });
      throw error;
    });
    await audit(context, {
      action: "class_periods.replace",
      objectType: "org",
      objectId: context.schoolId,
      change: {
        table: "core.class_periods",
        before: { from: input.from, periods: before.map(periodView) },
        after: { from: input.from, periods: input.periods.map(periodView) },
      },
      details: outcome,
    });
    return { from: input.from, ...outcome };
  });

const extraView = (row: {
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  kind: string;
  startTime: string;
  endTime: string;
}) => ({
  code: row.code,
  nameEn: row.nameEn,
  nameAr: row.nameAr,
  kind: row.kind,
  startTime: row.startTime,
  endTime: row.endTime,
});

function scheduleRefused(error: unknown): never {
  if (error instanceof BellScheduleConflict)
    throw new ORPCError("CONFLICT", { message: error.code });
  throw error;
}

/**
 * Adds a bell schedule, or changes one: other times for the periods held
 * on the days that choose it, and periods of its own (an assembly, an exam
 * slot) that only its days hold. Periods it leaves out are not held on
 * those days.
 */
export const saveSchedule = writeProcedure
  .input(saveBellScheduleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const values = {
      ...scope(context),
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      times: input.times,
    };
    const before = input.id
      ? (await bellSchedulesOf(context.tx, scope(context))).find(
          (row) => row.id === input.id,
        )
      : undefined;
    if (input.id && !before) throw new ORPCError("NOT_FOUND");
    const extrasBefore = input.id
      ? await extraPeriodsOf(context.tx, {
          tenantId: context.tenantId,
          scheduleIds: [input.id],
        })
      : [];
    let saved = input.id ?? "";
    if (input.id)
      await updateBellSchedule(context.tx, {
        ...values,
        id: input.id,
        version: input.version ?? 0,
      }).catch(scheduleRefused);
    else saved = await insertBellSchedule(context.tx, values);
    const extras = await setExtraPeriods(context.tx, {
      ...scope(context),
      scheduleId: saved,
      times: input.times,
      extras: input.extras,
      firstUse: (ids, from) => firstPeriodUse(context, ids, from),
    }).catch(scheduleRefused);
    await audit(context, {
      action: input.id ? "bell_schedule.update" : "bell_schedule.create",
      objectType: "bell_schedule",
      objectId: saved,
      change: {
        table: "core.bell_schedules",
        before: before
          ? {
              nameEn: before.nameEn,
              nameAr: before.nameAr,
              times: before.times,
              extras: extrasBefore.map(extraView),
            }
          : null,
        after: {
          nameEn: input.nameEn,
          nameAr: input.nameAr,
          times: input.times,
          extras: input.extras.map(extraView),
        },
      },
      details: extras,
    });
    return { id: saved };
  });

/** Removes a bell schedule; its days go back to their periods' own times. */
export const removeSchedule = writeProcedure
  .input(removeBellScheduleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const schedule = (await bellSchedulesOf(context.tx, scope(context))).find(
      (row) => row.id === input.id,
    );
    if (!schedule) throw new ORPCError("NOT_FOUND");
    const extras = await extraPeriodsOf(context.tx, {
      tenantId: context.tenantId,
      scheduleIds: [schedule.id],
    });
    const removed = await removeBellSchedule(context.tx, {
      ...scope(context),
      id: input.id,
      version: input.version,
      firstUse: (ids, from) => firstPeriodUse(context, ids, from),
    }).catch(scheduleRefused);
    await audit(context, {
      action: "bell_schedule.remove",
      objectType: "bell_schedule",
      objectId: input.id,
      change: {
        table: "core.bell_schedules",
        before: {
          nameEn: schedule.nameEn,
          nameAr: schedule.nameAr,
          times: schedule.times,
          extras: extras.map(extraView),
        },
        after: null,
      },
      details: { days: removed.days },
    });
    return { days: removed.days };
  });

/**
 * How the timetable runs a span of the school's days, for the school-days
 * planner: the bell schedule and the day of the cycle each runs on, the
 * schedules a day may choose and the timetables whose cycles a day can run
 * as another day of.
 */
export const days = readProcedure
  .input(timetableDaysSchema)
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "calendar:manage",
      "school:manage",
      "timetable:manage",
    );
    const [rows, schedules, timetables, week] = await Promise.all([
      timetableDays(context.tx, { ...scope(context), ...input }),
      bellSchedulesOf(context.tx, scope(context)),
      timetablesOf(context.tx, scope(context)),
      schoolWeek(context.tx, context.tenantId, context.schoolId),
    ]);
    return {
      days: rows,
      schedules: schedules.map((row) => ({
        id: row.id,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
      })),
      timetables: timetables.map((row) => ({
        id: row.id,
        startsOn: row.startsOn,
        kind: row.kind,
        length: row.length,
      })),
      weekdays: schoolDays(week.weekStart, week.weekendDays),
      canEdit: can(context, "calendar:manage"),
    };
  });

/**
 * Runs one school day as another day of its timetable's cycle, so its
 * lessons, registers and cover are that day's, or puts it back with null.
 * Where the timetable's closures hold its cycle of days in place, the days
 * after carry on from the day it ran as.
 */
export const runDay = writeProcedure
  .input(runDayAsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage");
    if (input.runsAs !== null) {
      const [plan, timetables, week] = await Promise.all([
        dayPlan(context.tx, { ...scope(context), day: input.day }),
        timetablesOf(context.tx, scope(context)),
        schoolWeek(context.tx, context.tenantId, context.schoolId),
      ]);
      if (!plan.open)
        throw new ORPCError("BAD_REQUEST", {
          message: "calendar.runs_as_closed",
        });
      const timetable = timetableOn(timetables, input.day);
      if (
        !timetable ||
        !cycleDays(
          timetable,
          schoolDays(week.weekStart, week.weekendDays),
        ).includes(input.runsAs)
      )
        throw new ORPCError("BAD_REQUEST", { message: "calendar.runs_as_day" });
    }
    const changed = await runDayAs(context.tx, {
      ...scope(context),
      day: input.day,
      runsAs: input.runsAs,
    });
    await audit(context, {
      action: "calendar.runs_as",
      objectType: "org",
      objectId: context.schoolId,
      change: {
        table: "core.timetable_days",
        before: { day: input.day, runsAs: changed.before },
        after: { day: input.day, runsAs: input.runsAs },
      },
    });
    return { day: input.day, runsAs: input.runsAs };
  });

/**
 * Runs a range of the school's days on a bell schedule, or back on their
 * own times. Weekends the school left alone stay as they are. Every week,
 * register and feed reads the day's times from it.
 */
export const scheduleRange = writeProcedure
  .input(scheduleDaysSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage");
    if (
      input.scheduleId &&
      !(await bellSchedulesOf(context.tx, scope(context))).some(
        (row) => row.id === input.scheduleId,
      )
    )
      throw new ORPCError("NOT_FOUND");
    const [week, marks] = await Promise.all([
      schoolWeek(context.tx, context.tenantId, context.schoolId),
      markedMeanings(context.tx, { ...scope(context), ...input }),
    ]);
    const held: string[] = [];
    for (let day = input.from; day <= input.to; day = addDays(day, 1))
      if (!dayRests(week, day, marks.get(day) ?? null)) held.push(day);
    const changed = await scheduleDays(context.tx, {
      ...scope(context),
      days: held,
      scheduleId: input.scheduleId || null,
    });
    await audit(context, {
      action: "calendar.bell_schedule",
      objectType: "org",
      objectId: context.schoolId,
      details: {
        from: input.from,
        to: input.to,
        scheduleId: input.scheduleId || null,
        changed,
      },
    });
    return { changed };
  });
