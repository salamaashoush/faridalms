import {
  BellScheduleConflict,
  extraPeriodsOf,
  insertBellSchedule,
  removeBellSchedule,
  setExtraPeriods,
  updateBellSchedule,
} from "@faridalms/database/stores/bell-schedules";
import { bellSchedulesOf } from "@faridalms/database/stores/day-plan";
import {
  PeriodChangeError,
  periodChangeDays,
  periodsInForce,
  replacePeriodsFrom,
} from "@faridalms/database/stores/periods";
import {
  dayIn,
  holdYear,
  schoolWeek,
  schoolYears,
} from "@faridalms/database/stores/years";
import { addDays } from "@faridalms/domain/school";
import {
  periodsQuerySchema,
  removeBellScheduleSchema,
  saveBellScheduleSchema,
  savePeriodsSchema,
  schoolDays,
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

async function yearOf(context: UnitContext, yearId: string) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year = years.find((row) => row.id === yearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  return year;
}

/**
 * A year's school day as it stands on a date: its periods in order, the
 * days of the week they run on and the days the day changes shape on.
 */
export const periods = readProcedure
  .input(periodsQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "years:manage",
      "school:manage",
      "timetable:manage",
    );
    const year = await yearOf(context, input.id);
    const on = dayIn(year, input.on || context.today);
    const [week, rows, changes, schedules] = await Promise.all([
      schoolWeek(context.tx, context.tenantId, context.schoolId),
      periodsInForce(context.tx, {
        tenantId: context.tenantId,
        yearId: year.id,
        on,
      }),
      periodChangeDays(context.tx, {
        tenantId: context.tenantId,
        yearId: year.id,
      }),
      bellSchedulesOf(context.tx, {
        tenantId: context.tenantId,
        yearIds: [year.id],
      }),
    ]);
    const extras = await extraPeriodsOf(context.tx, {
      tenantId: context.tenantId,
      scheduleIds: schedules.map((row) => row.id),
    });
    return {
      year: {
        id: year.id,
        startsOn: year.startsOn,
        lastDay: addDays(year.endsBefore, -1),
        closed: year.lifecycle === "closed",
      },
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
      canEdit:
        (can(context, "years:manage") || can(context, "timetable:manage")) &&
        year.lifecycle !== "closed",
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
 * Sets a year's school day from a date on. Earlier days keep the periods
 * they had, so registers already taken read as they were.
 */
export const savePeriods = writeProcedure
  .input(savePeriodsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage", "timetable:manage");
    const year = await yearOf(context, input.yearId);
    const held = await holdYear(context.tx, context.tenantId, year.id);
    if (held === "closed")
      throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    if (input.from < year.startsOn || input.from >= year.endsBefore)
      throw new ORPCError("BAD_REQUEST", {
        message: "class_period.outside_year",
      });
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
      tenantId: context.tenantId,
      yearId: year.id,
      on: input.from,
    });
    const outcome = await replacePeriodsFrom(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      yearEndsBefore: year.endsBefore,
      from: input.from,
      known: input.known,
      periods: input.periods,
    }).catch((error: unknown) => {
      if (error instanceof PeriodChangeError)
        throw new ORPCError("CONFLICT", { message: error.code });
      throw error;
    });
    await audit(context, {
      action: "class_periods.replace",
      objectType: "academic_session",
      objectId: year.id,
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

/** A year this school may still plan the day of, for a bell schedule change. */
async function plannedYear(context: UnitContext, yearId: string) {
  requireCapability(context, "years:manage", "timetable:manage");
  const year = await yearOf(context, yearId);
  const held = await holdYear(context.tx, context.tenantId, year.id);
  if (held === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  return year;
}

function scheduleRefused(error: unknown): never {
  if (error instanceof BellScheduleConflict)
    throw new ORPCError("CONFLICT", { message: error.code });
  throw error;
}

/**
 * Adds a bell schedule to a year, or changes one: other times for the
 * periods held on the days that choose it, and periods of its own (an
 * assembly, an exam slot) that only its days hold. Periods it leaves out
 * are not held on those days.
 */
export const saveSchedule = writeProcedure
  .input(saveBellScheduleSchema)
  .handler(async ({ input, context }) => {
    const year = await plannedYear(context, input.yearId);
    const values = {
      tenantId: context.tenantId,
      yearId: year.id,
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      times: input.times,
    };
    const before = input.id
      ? (
          await bellSchedulesOf(context.tx, {
            tenantId: context.tenantId,
            yearIds: [year.id],
          })
        ).find((row) => row.id === input.id)
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
    else
      saved = await insertBellSchedule(context.tx, {
        ...values,
        schoolId: context.schoolId,
      });
    const extras = await setExtraPeriods(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      year,
      scheduleId: saved,
      times: input.times,
      extras: input.extras,
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
    requireCapability(context, "years:manage", "timetable:manage");
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const schedules = await bellSchedulesOf(context.tx, {
      tenantId: context.tenantId,
      yearIds: years.map((row) => row.id),
    });
    const schedule = schedules.find((row) => row.id === input.id);
    if (!schedule) throw new ORPCError("NOT_FOUND");
    await plannedYear(context, schedule.yearId);
    const extras = await extraPeriodsOf(context.tx, {
      tenantId: context.tenantId,
      scheduleIds: [schedule.id],
    });
    const removed = await removeBellSchedule(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
      version: input.version,
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
