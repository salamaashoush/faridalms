import type { SchoolYear } from "@faridalms/database/stores/years";
import type { OpenSpan } from "@faridalms/domain/school";
import type { ReportingSpan } from "@faridalms/domain/spans";

import { classById } from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  endPlacement,
  place,
  placements,
  reopenPlacement,
  voidPlacementsFrom,
  yearStudents,
} from "@faridalms/database/stores/placements";
import {
  classesOfYear,
  dayIn,
  holdYear,
  linkClass,
  schoolYears,
  termsOf,
  workingYear,
  yearHolds,
  yearOfClass,
} from "@faridalms/database/stores/years";
import { addDays } from "@faridalms/domain/school";
import {
  classYearPartSchema,
  leavingYearPartSchema,
  yearViewSchema,
} from "@faridalms/domain/years";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { ViewValue } from "../classes/points";
import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import {
  classFormParts,
  classGuards,
  classJoins,
  classViews,
} from "../classes/points";
import { contribute } from "../core/extension";
import { audit } from "../core/procedure";
import { scopeFor } from "../core/reach";
import { reportingSpans } from "../core/spans";
import { leavingParts, studentViews } from "../people/points";
import { openYear } from "./years";

function parsed<T extends v.GenericSchema>(
  schema: T,
  value: unknown,
): v.InferOutput<T> {
  const result = v.safeParse(schema, value);
  if (!result.success)
    throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
  return result.output;
}

/**
 * The year a view names: the working year given none, every year's for
 * "all", else the one asked, which must be the school's.
 */
async function viewedYear(
  context: UnitContext,
  value: ViewValue,
): Promise<{ year: SchoolYear; working: boolean } | null> {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const working = workingYear(years, context.today);
  if (value === null) return working ? { year: working, working: true } : null;
  const asked = parsed(yearViewSchema, value);
  if (asked === "all") return null;
  const year = years.find((row) => row.id === asked);
  if (!year) throw new ORPCError("NOT_FOUND");
  return { year, working: year.id === working?.id };
}

/**
 * The year a class belongs to, kept only while the class's days lie inside
 * it. A class whose days left its year while the module was off is no
 * longer the year's once the module next acts on it.
 */
async function reconciledYear(
  context: UnitContext,
  classId: string,
): Promise<SchoolYear | null> {
  const yearId = await yearOfClass(context.tx, context.tenantId, classId);
  if (!yearId) return null;
  const year = (
    await schoolYears(context.tx, context.tenantId, context.schoolId)
  ).find((row) => row.id === yearId);
  const found = await classById(context.tx, context, classId);
  if (year && found && yearHolds(year, found.runs)) return year;
  await linkClass(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    classId,
    yearId: null,
  });
  await audit(context, {
    action: "class.year_unlinked",
    objectType: "class",
    objectId: classId,
    details: { schoolYearId: yearId },
  });
  return null;
}

async function linkedYear(context: UnitContext, classId: string) {
  const yearId = await yearOfClass(context.tx, context.tenantId, classId);
  if (!yearId) return null;
  return (
    (await schoolYears(context.tx, context.tenantId, context.schoolId)).find(
      (row) => row.id === yearId,
    ) ?? null
  );
}

const outside = (year: SchoolYear, runs: OpenSpan) => !yearHolds(year, runs);

/** A class in a closed year takes no more changes and records nothing more. */
async function closedYearOf(context: UnitContext, classId: string) {
  const year = await linkedYear(context, classId);
  return year &&
    (await holdYear(context.tx, context.tenantId, year.id)) === "closed"
    ? "school_year.closed"
    : null;
}

/** The year a day falls in, else the working year, and its terms: the spans the school reports over. */
async function yearSpans(
  context: UnitContext,
  day: string,
): Promise<ReportingSpan[]> {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year =
    years.find((row) => row.startsOn <= day && day < row.endsBefore) ??
    workingYear(years, day);
  if (!year) return [];
  const terms = await termsOf(context.tx, context.tenantId, year.id);
  return [
    {
      key: `year:${year.id}`,
      titleEn: year.titleEn,
      titleAr: year.titleAr,
      from: year.startsOn,
      endsBefore: year.endsBefore,
    },
    ...terms.map((term) => ({
      key: `term:${term.id}`,
      titleEn: term.titleEn,
      titleAr: term.titleAr,
      from: term.startsOn,
      endsBefore: term.endsBefore,
    })),
  ];
}

/** What school years tell the rest of the product, wherever it asks. */
export const SCHOOL_YEARS: ModuleContributions = {
  module: "school_years",
  contributions: [
    contribute(reportingSpans, { spansOn: yearSpans }),
    contribute(classViews, {
      key: "year",
      select: async (context, value) => {
        const viewed = await viewedYear(context, value);
        if (!viewed) return null;
        return {
          classIds: (
            await classesOfYear(context.tx, context.tenantId, viewed.year.id)
          ).map((row) => row.id),
          on: dayIn(viewed.year, context.today),
          settled: viewed.year.lifecycle === "closed",
          title: { titleEn: viewed.year.titleEn, titleAr: viewed.year.titleAr },
        };
      },
    }),
    contribute(classGuards, {
      refusesChange: closedYearOf,
      settles: closedYearOf,
      refusesRuns: async (context, classId, runs) => {
        const year = await linkedYear(context, classId);
        return year && outside(year, runs) ? "school_year.class_outside" : null;
      },
    }),
    contribute(classFormParts, {
      key: "year",
      save: async (context, input) => {
        const { yearId } = parsed(classYearPartSchema, input.value);
        for (const classId of input.classIds)
          if (!input.created) await reconciledYear(context, classId);
        if (yearId) {
          const { year } = await openYear(context, yearId);
          if (outside(year, input.runs))
            throw new ORPCError("BAD_REQUEST", {
              message: "school_year.class_outside",
            });
        }
        for (const classId of input.classIds)
          await linkClass(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            classId,
            yearId: yearId || null,
          });
      },
    }),
    // A student who joins a class of a year is placed in that year.
    contribute(classJoins, {
      joined: async (context, joins, from) => {
        for (const [classId, studentIds] of joins) {
          const year = await reconciledYear(context, classId);
          if (!year) continue;
          for (const studentId of studentIds)
            await place(context.tx, scopeFor(context, "classes"), {
              studentId,
              year,
              from,
            });
        }
      },
    }),
    contribute(studentViews, {
      key: "year",
      select: async (context, value) => {
        const viewed = await viewedYear(context, value);
        if (!viewed) return null;
        const rows = await yearStudents(context.tx, context, {
          yearId: viewed.year.id,
          working: viewed.working,
        });
        return {
          ids: rows.map((row) => row.studentId),
          statuses: rows.map((row) => row.status),
          on: dayIn(viewed.year, context.today),
        };
      },
    }),
    contribute(leavingParts, {
      key: "year",
      leave: async (context, input) => {
        const scope = scopeFor(context, "people");
        const lastDay = addDays(input.leftOn, -1);
        const placement = (
          await placements(context.tx, scope, input.studentId)
        ).find((row) => row.from <= lastDay && lastDay < row.to);
        if (!placement)
          throw new ORPCError("BAD_REQUEST", {
            message: "leaving.not_enrolled",
          });
        await openYear(context, placement.schoolYearId);
        const part = v.safeParse(leavingYearPartSchema, input.value);
        if (!part.success)
          throw new ORPCError("BAD_REQUEST", {
            message: "leaving.reason_required",
          });
        const reasons = await descriptorsFor(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace: "school_exit_type",
          today: context.today,
        });
        if (!reasons.some((row) => row.id === part.output.exitTypeId))
          throw new ORPCError("NOT_FOUND");
        const dropped = await voidPlacementsFrom(context.tx, scope, {
          studentId: input.studentId,
          from: input.leftOn,
        });
        await endPlacement(context.tx, {
          tenantId: context.tenantId,
          placementId: placement.id,
          on: input.leftOn,
          exitTypeId: part.output.exitTypeId,
          destination: part.output.destination,
        });
        return { placementId: placement.id, until: placement.to, dropped };
      },
      cancel: async (context, input) => {
        const ended = v.safeParse(
          v.nullable(
            v.object({
              placementId: v.string(),
              until: v.string(),
              dropped: v.array(v.string()),
            }),
          ),
          input.ended,
        );
        if (!ended.success || !ended.output) return;
        const placement = (
          await placements(
            context.tx,
            scopeFor(context, "people"),
            input.studentId,
          )
        ).find((row) => row.id === ended.output?.placementId);
        if (placement) await openYear(context, placement.schoolYearId);
        await reopenPlacement(context.tx, {
          tenantId: context.tenantId,
          ...ended.output,
        });
      },
    }),
  ],
};
