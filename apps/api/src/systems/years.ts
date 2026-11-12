import type { SchoolYear } from "@faridalms/database/stores/years";

import {
  classById,
  enrollmentHistory,
} from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { historyOf } from "@faridalms/database/stores/history";
import {
  placements,
  saveArrival as storeArrival,
} from "@faridalms/database/stores/placements";
import {
  calendarSummary,
  createYear,
  holdYear,
  schoolYears,
  yearsOfClasses,
  setTargetDays,
  setYearLifecycle,
  targetDays,
  termsOf,
  updateYear,
  YearChangeError,
  workingYear,
  yearDirectory,
  yearOfClass,
} from "@faridalms/database/stores/years";
import { historyQuerySchema } from "@faridalms/domain/history";
import { PAGE_SIZE } from "@faridalms/domain/paging";
import { addDays, dayWithin } from "@faridalms/domain/school";
import { schoolDaysQuerySchema } from "@faridalms/domain/school-days";
import {
  placementStatus,
  saveArrivalSchema,
  saveYearSchema,
  targetDaysSchema,
  yearLifecycleSchema,
  yearStanding,
  yearTransitionIssue,
} from "@faridalms/domain/years";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { runsRefusal } from "../classes/points";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { reachesClass, requireStudent, scopeFor } from "../core/reach";

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
    const [terms, calendar, target] = await Promise.all([
      termsOf(context.tx, context.tenantId, year.id),
      calendarSummary(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        year,
      }),
      targetDays(context.tx, context.tenantId, year.id),
    ]);
    return {
      ...year,
      standing: yearStanding(year, context.today),
      today: context.today,
      terms,
      calendar,
      targetDays: target,
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
      await audit(context, {
        action: "academic_session.create",
        objectType: "academic_session",
        objectId: created.id,
        change: {
          table: "core.academic_sessions",
          before: null,
          after: { ...input, terms: input.terms.length },
        },
      });
      return {
        id: created.id,
        version: (await yearOf(context, created.id)).version,
      };
    }
    const before = await yearOf(context, input.id);
    const termsBefore = await termsOf(context.tx, context.tenantId, input.id);
    await updateYear(context.tx, {
      ...values,
      id: input.id,
      expectedVersion: input.expectedVersion ?? 0,
      refusesRuns: (classId, runs) => runsRefusal(context, classId, runs),
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
          endsOn: addDays(before.endsBefore, -1),
          terms: termsBefore.length,
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
 * The years a span of the school's days falls in, for the planner: each
 * with its terms, its school days and closed days counted, and the count
 * it aims at.
 */
export const planner = readProcedure
  .input(schoolDaysQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "years:manage",
      "school:manage",
      "calendar:manage",
    );
    const years = (
      await schoolYears(context.tx, context.tenantId, context.schoolId)
    )
      .filter(
        (year) => year.startsOn <= input.to && input.from < year.endsBefore,
      )
      .toSorted((a, b) => a.startsOn.localeCompare(b.startsOn));
    return {
      canEdit: can(context, "calendar:manage"),
      years: await Promise.all(
        years.map(async (year) => {
          const [terms, calendar, target] = await Promise.all([
            termsOf(context.tx, context.tenantId, year.id),
            calendarSummary(context.tx, {
              tenantId: context.tenantId,
              schoolId: context.schoolId,
              year,
            }),
            targetDays(context.tx, context.tenantId, year.id),
          ]);
          return {
            id: year.id,
            titleEn: year.titleEn,
            titleAr: year.titleAr,
            startsOn: year.startsOn,
            endsBefore: year.endsBefore,
            closed: year.lifecycle === "closed",
            terms: terms.map((term) => ({
              id: term.id,
              titleEn: term.titleEn,
              titleAr: term.titleAr,
              startsOn: term.startsOn,
              endsBefore: term.endsBefore,
            })),
            schoolDays: calendar.schoolDays,
            closedDays: calendar.closedDays,
            targetDays: target,
          };
        }),
      ),
    };
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

function yearView(year: SchoolYear) {
  return {
    id: year.id,
    titleEn: year.titleEn,
    titleAr: year.titleAr,
    startsOn: year.startsOn,
    endsBefore: year.endsBefore,
    lifecycle: year.lifecycle,
  };
}

/** The school's years and what placing a student in one offers, for the forms that ask for a year. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(
    context,
    "classes:read",
    "classes:manage",
    "people:read",
    "people:manage",
  );
  const load = (namespace: string) =>
    descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace,
      today: context.today,
    });
  const [years, entryTypes, exitTypes] = await Promise.all([
    schoolYears(context.tx, context.tenantId, context.schoolId),
    load("school_entry_type"),
    load("school_exit_type"),
  ]);
  return {
    years: years.map(yearView),
    workingYearId: workingYear(years, context.today)?.id ?? null,
    entryTypes,
    exitTypes,
    today: context.today,
  };
});

/** The year a class belongs to, for whoever may open the class. */
export const ofClass = readProcedure
  .input(v.object({ classId: id }))
  .handler(async ({ input, context }) => {
    const found = await classById(context.tx, context, input.classId);
    if (!found) throw new ORPCError("NOT_FOUND");
    if (
      !(await reachesClass(
        context,
        "classes",
        found.id,
        dayWithin(found.runs, context.today),
      ))
    )
      throw new ORPCError("NOT_FOUND");
    const yearId = await yearOfClass(context.tx, context.tenantId, found.id);
    const year = yearId ? await yearOf(context, yearId) : null;
    return { year: year ? yearView(year) : null };
  });

/** The year of each class a student has been in, for their record's class history. */
export const ofStudentClasses = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage", "classes:read");
    await requireStudent(context, "classes", input.studentId);
    const episodes = await enrollmentHistory(
      context.tx,
      context,
      input.studentId,
    );
    const [linked, years] = await Promise.all([
      yearsOfClasses(
        context.tx,
        context.tenantId,
        episodes.map((row) => row.classId),
      ),
      schoolYears(context.tx, context.tenantId, context.schoolId),
    ]);
    return {
      classes: [...linked].flatMap(([classId, yearId]) => {
        const year = years.find((row) => row.id === yearId);
        return year
          ? [{ classId, titleEn: year.titleEn, titleAr: year.titleAr }]
          : [];
      }),
    };
  });

/** A student's placements in the school's years, newest first, with the one that holds today. */
export const placementsOf = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, "people", input.studentId);
    const scope = scopeFor(context, "people");
    const [placed, years] = await Promise.all([
      placements(context.tx, scope, input.studentId),
      schoolYears(context.tx, context.tenantId, context.schoolId),
    ]);
    return {
      placements: placed,
      current:
        placed.find(
          (row) => row.from <= context.today && context.today < row.to,
        ) ?? null,
      status: placementStatus(
        placed.map((row) => ({
          validFrom: row.from,
          validTo: row.to,
          exitMeaning: row.exitMeaning,
        })),
        context.today,
      ),
      workingYearId: workingYear(years, context.today)?.id ?? null,
      manage: can(context, "people:manage"),
    };
  });

/**
 * Records how a student came to a placement: as a new entrant, a transfer
 * and the like, and the school they came from, which a school that takes a
 * transfer is asked to keep with the papers that prove it.
 */
export const saveArrival = writeProcedure
  .input(saveArrivalSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const scope = scopeFor(context, "people");
    await requireStudent(context, "people", input.studentId);
    const placement = (
      await placements(context.tx, scope, input.studentId)
    ).find((row) => row.id === input.placementId);
    if (!placement) throw new ORPCError("NOT_FOUND");
    await openYear(context, placement.schoolYearId);
    const entryTypeId = input.entryTypeId || null;
    if (
      entryTypeId &&
      !(
        await descriptorsFor(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace: "school_entry_type",
          today: context.today,
        })
      ).some((row) => row.id === entryTypeId)
    )
      throw new ORPCError("NOT_FOUND");
    await storeArrival(context.tx, {
      tenantId: context.tenantId,
      placementId: placement.id,
      entryTypeId,
      previousSchool: input.previousSchool,
    });
    await audit(context, {
      action: "placement.change",
      objectType: "user",
      objectId: input.studentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { placementId: placement.id, entryTypeId },
    });
    return { saved: true };
  });

/**
 * What the office should have ready as the working year nears its end: the
 * next year, and how many classes and students it holds so far. Nothing
 * until the year's last eight weeks.
 */
export const yearEnd = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "years:manage");
  const years = await yearDirectory(
    context.tx,
    context.tenantId,
    context.schoolId,
    context.today,
  );
  const year = workingYear(years, context.today);
  if (!year) return null;
  const lastDay = addDays(year.endsBefore, -1);
  if (addDays(context.today, 56) < lastDay) return null;
  const next = years.find((row) => row.startsOn >= year.endsBefore);
  return {
    yearEnds: lastDay,
    nextYear: Boolean(next),
    nextClasses: next?.classes ?? 0,
    nextStudents: next?.students ?? 0,
  };
});
