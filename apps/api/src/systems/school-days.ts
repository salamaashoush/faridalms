import { scheduleDays } from "@faridalms/database/stores/bell-schedules";
import {
  bellSchedulesOf,
  dayPlan,
  timetablesOf,
} from "@faridalms/database/stores/day-plan";
import {
  holdYear,
  paintDays,
  runDayAs,
  schoolWeek,
  schoolYears,
  termsOf,
  yearCalendar,
} from "@faridalms/database/stores/years";
import { paintDaysSchema } from "@faridalms/domain/calendar";
import { cycleDays, timetableOn } from "@faridalms/domain/cycle";
import {
  runDayAsSchema,
  scheduleDaysSchema,
  schoolDays,
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

const id = v.pipe(v.string(), v.uuid());

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
 * A year's school calendar day by day, with its terms, the count it aims
 * at, and the timetables whose cycles a day can run as another day of.
 */
export const days = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "years:manage",
      "school:manage",
      "calendar:manage",
    );
    const year = await yearOf(context, input.id);
    const [calendar, terms, schedules, timetables, week] = await Promise.all([
      yearCalendar(context.tx, context.tenantId, year.id),
      termsOf(context.tx, context.tenantId, year.id),
      bellSchedulesOf(context.tx, {
        tenantId: context.tenantId,
        yearIds: [year.id],
      }),
      timetablesOf(context.tx, {
        tenantId: context.tenantId,
        yearIds: [year.id],
      }),
      schoolWeek(context.tx, context.tenantId, context.schoolId),
    ]);
    return {
      ...calendar,
      terms,
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
      canEdit: can(context, "calendar:manage") && year.lifecycle !== "closed",
    };
  });

/** A year of this school whose calendar can still change, held open until the write ends. */
async function openYear(context: UnitContext, yearId: string) {
  requireCapability(context, "calendar:manage");
  const year = await yearOf(context, yearId);
  const held = await holdYear(context.tx, context.tenantId, year.id);
  if (held === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  return year;
}

/**
 * Marks a run of days as holidays, exam days, staff days, closures or back
 * to normal. Registers follow at once: a day that stops being a school day
 * asks for none.
 */
export const paint = writeProcedure
  .input(paintDaysSchema)
  .handler(async ({ input, context }) => {
    const year = await openYear(context, input.yearId);
    const week = await schoolWeek(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const changed = await paintDays(context.tx, {
      tenantId: context.tenantId,
      yearId: year.id,
      from: input.from,
      to: input.to,
      kind: input.kind,
      noteEn: input.noteEn || null,
      noteAr: input.noteAr || null,
      provisional: input.provisional,
      weekendDays: week.weekendDays,
    });
    await audit(context, {
      action: "calendar_dates.mark",
      objectType: "academic_session",
      objectId: year.id,
      details: { from: input.from, to: input.to, kind: input.kind, changed },
    });
    return { changed };
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
    const year = await openYear(context, input.yearId);
    if (input.day < year.startsOn || input.day >= year.endsBefore)
      throw new ORPCError("BAD_REQUEST", { message: "calendar.range" });
    if (input.runsAs !== null) {
      const [plan, timetables, week] = await Promise.all([
        dayPlan(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          day: input.day,
        }),
        timetablesOf(context.tx, {
          tenantId: context.tenantId,
          yearIds: [year.id],
        }),
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
      tenantId: context.tenantId,
      yearId: year.id,
      day: input.day,
      runsAs: input.runsAs,
    });
    if (!changed) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "calendar.runs_as",
      objectType: "academic_session",
      objectId: year.id,
      change: {
        table: "core.calendar_dates",
        before: { day: input.day, runsAs: changed.before },
        after: { day: input.day, runsAs: input.runsAs },
      },
    });
    return { day: input.day, runsAs: input.runsAs };
  });

/**
 * Runs a range of the year's days on a bell schedule, or back on their own
 * times. Every week, register and feed reads the day's times from it.
 */
export const scheduleRange = writeProcedure
  .input(scheduleDaysSchema)
  .handler(async ({ input, context }) => {
    const year = await openYear(context, input.yearId);
    if (input.from < year.startsOn || input.to >= year.endsBefore)
      throw new ORPCError("BAD_REQUEST", { message: "calendar.range" });
    if (input.scheduleId) {
      const schedules = await bellSchedulesOf(context.tx, {
        tenantId: context.tenantId,
        yearIds: [year.id],
      });
      if (!schedules.some((row) => row.id === input.scheduleId))
        throw new ORPCError("NOT_FOUND");
    }
    const changed = await scheduleDays(context.tx, {
      tenantId: context.tenantId,
      yearId: year.id,
      from: input.from,
      to: input.to,
      scheduleId: input.scheduleId || null,
    });
    await audit(context, {
      action: "calendar.bell_schedule",
      objectType: "academic_session",
      objectId: year.id,
      details: {
        from: input.from,
        to: input.to,
        scheduleId: input.scheduleId || null,
        changed,
      },
    });
    return { changed };
  });
