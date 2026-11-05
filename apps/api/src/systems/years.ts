import { historyOf } from "@faridalms/database/stores/history";
import {
  givePeriods,
  PeriodChangeError,
  periodChangeDays,
  periodsInForce,
  replacePeriodsFrom,
} from "@faridalms/database/stores/periods";
import {
  calendarSummary,
  createYear,
  dayIn,
  holdYear,
  paintDays,
  schoolWeek,
  schoolYears,
  setTargetDays,
  setYearLifecycle,
  termsOf,
  updateYear,
  YearChangeError,
  yearCalendar,
  yearDirectory,
} from "@faridalms/database/stores/years";
import { paintDaysSchema, targetDaysSchema } from "@faridalms/domain/calendar";
import { historyQuerySchema } from "@faridalms/domain/history";
import { PAGE_SIZE } from "@faridalms/domain/paging";
import { addDays } from "@faridalms/domain/school";
import {
  periodsQuerySchema,
  savePeriodsSchema,
  schoolDays,
} from "@faridalms/domain/timetable";
import {
  saveYearSchema,
  yearLifecycleSchema,
  yearStanding,
  yearTransitionIssue,
} from "@faridalms/domain/years";
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

const LIFECYCLE_ACTION = {
  make_current: { to: "current", audit: "academic_session.made_current" },
  close: { to: "closed", audit: "academic_session.closed" },
  reopen: { to: "upcoming", audit: "academic_session.reopened" },
} as const;

function requireReader(context: UnitContext) {
  requireCapability(context, "years:manage", "school:manage");
}

function accessOf(context: UnitContext) {
  return {
    manage: can(context, "years:manage"),
    reopen: can(context, "years:reopen"),
  };
}

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

function refused(error: unknown): never {
  if (error instanceof YearChangeError)
    throw new ORPCError(
      error.code === "school_year.end_year_fixed" ? "BAD_REQUEST" : "CONFLICT",
      { message: error.code },
    );
  throw error;
}

export const directory = readProcedure.handler(async ({ context }) => {
  requireReader(context);
  const years = await yearDirectory(
    context.tx,
    context.tenantId,
    context.schoolId,
    context.today,
  );
  return {
    today: context.today,
    access: accessOf(context),
    years: years.map((year) => ({
      ...year,
      standing: yearStanding(year, context.today),
    })),
  };
});

export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireReader(context);
    const summaries = await yearDirectory(
      context.tx,
      context.tenantId,
      context.schoolId,
      context.today,
    );
    const year = summaries.find((row) => row.id === input.id);
    if (!year) throw new ORPCError("NOT_FOUND");
    const [terms, calendar] = await Promise.all([
      termsOf(context.tx, context.tenantId, year.id),
      calendarSummary(context.tx, context.tenantId, year.id),
    ]);
    return {
      ...year,
      standing: yearStanding(year, context.today),
      today: context.today,
      terms,
      calendar,
      access: accessOf(context),
    };
  });

export const history = readProcedure
  .input(historyQuerySchema)
  .handler(async ({ input, context }) => {
    requireReader(context);
    await yearOf(context, input.id);
    return historyOf(
      context.tx,
      context.tenantId,
      { object: { type: "academic_session", id: input.id } },
      { limit: PAGE_SIZE, after: input.after },
    );
  });

/**
 * Creates a year or changes one that is not closed. The terms sent replace
 * the year's terms; a changed end date must stay in the calendar year the
 * school year ends in.
 */
export const save = writeProcedure
  .input(saveYearSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    const values = {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      terms: input.terms,
    };
    if (!input.id) {
      const created = await createYear(context.tx, values);
      const periods = await givePeriods(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        target: {
          id: created.id,
          startsOn: input.startsOn,
          endsBefore: addDays(input.endsOn, 1),
        },
      });
      await audit(context, {
        action: "academic_session.create",
        objectType: "academic_session",
        objectId: created.id,
        change: {
          table: "core.academic_sessions",
          before: null,
          after: { ...input, terms: input.terms.length, periods },
        },
      });
      return {
        id: created.id,
        version: (await yearOf(context, created.id)).version,
      };
    }
    const before = await yearOf(context, input.id);
    await updateYear(context.tx, {
      ...values,
      id: input.id,
      expectedVersion: input.expectedVersion ?? 0,
    }).catch(refused);
    await audit(context, {
      action: "academic_session.update",
      objectType: "academic_session",
      objectId: input.id,
      change: {
        table: "core.academic_sessions",
        before: {
          titleEn: before.titleEn,
          titleAr: before.titleAr,
          startsOn: before.startsOn,
          endsBefore: before.endsBefore,
        },
        after: {
          titleEn: input.titleEn,
          titleAr: input.titleAr,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          terms: input.terms.length,
        },
      },
    });
    // A save that moves the dates writes the year's row more than once, so
    // the version a client sends next is read back rather than counted.
    return { id: input.id, version: (await yearOf(context, input.id)).version };
  });

export const lifecycle = writeProcedure
  .input(yearLifecycleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    if (input.action === "reopen") requireCapability(context, "years:reopen");
    const year = await yearOf(context, input.id);
    if (year.version !== input.expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const issue = yearTransitionIssue(year.lifecycle, input.action, input);
    if (issue)
      throw new ORPCError(
        issue === "school_year.reason_required" ? "BAD_REQUEST" : "CONFLICT",
        { message: issue },
      );
    const step = LIFECYCLE_ACTION[input.action];
    const { replaced } = await setYearLifecycle(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      expectedVersion: input.expectedVersion,
      to: step.to,
    }).catch(refused);
    if (replaced)
      await audit(context, {
        action: "academic_session.closed",
        objectType: "academic_session",
        objectId: replaced,
        details: { replacedBy: year.id },
      });
    await audit(context, {
      action: step.audit,
      objectType: "academic_session",
      objectId: year.id,
      change: {
        table: "core.academic_sessions",
        before: { lifecycle: year.lifecycle },
        after:
          input.action === "reopen"
            ? { lifecycle: step.to, reason: input.reason }
            : { lifecycle: step.to },
      },
    });
    return { id: year.id, replaced };
  });

/** A year's school calendar day by day, with its terms and the count it aims at. */
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
    const [calendar, terms] = await Promise.all([
      yearCalendar(context.tx, context.tenantId, year.id),
      termsOf(context.tx, context.tenantId, year.id),
    ]);
    return {
      ...calendar,
      terms,
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

export const target = writeProcedure
  .input(targetDaysSchema)
  .handler(async ({ input, context }) => {
    const year = await openYear(context, input.yearId);
    await setTargetDays(context.tx, {
      tenantId: context.tenantId,
      yearId: year.id,
      target: input.target,
    });
    await audit(context, {
      action: "calendar.target_days",
      objectType: "academic_session",
      objectId: year.id,
      details: { target: input.target },
    });
    return { target: input.target };
  });

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
    const [week, rows, changes] = await Promise.all([
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
    ]);
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
      periods: rows.map((row) => ({
        id: row.id,
        version: row.version,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        kind: row.kind,
        startTime: row.startTime,
        endTime: row.endTime,
        official: row.official,
        weekdays: [...row.weekdays],
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
}) => ({
  nameEn: row.nameEn,
  nameAr: row.nameAr,
  kind: row.kind,
  startTime: row.startTime,
  endTime: row.endTime,
  official: row.official,
  weekdays: [...row.weekdays],
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
