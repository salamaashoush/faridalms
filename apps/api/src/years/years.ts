import type { SchoolYear } from "@faridalms/database/stores/years";
import type { Capability } from "@faridalms/domain/capabilities";

import {
  holdYear,
  schoolYears,
  workingYear,
  yearOfClass,
} from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

/** Who reads the school's years: for classes, students and the intakes that admit into a year. */
export const YEAR_READERS = [
  "classes:read",
  "classes:manage",
  "people:read",
  "people:manage",
  "admissions:read",
  "admissions:configure",
] as const satisfies readonly Capability[];

/**
 * The year a request names, or the working year when it names none. A year
 * the school does not have is refused, never swapped for another.
 */
export async function yearOf(context: UnitContext, requested: string) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year = requested
    ? years.find((row) => row.id === requested)
    : workingYear(years, context.today);
  if (requested && !year) throw new ORPCError("NOT_FOUND");
  return { years, year: year ?? null };
}

/** The year after `year`: the next to start once it ends. */
export function yearAfter(years: readonly SchoolYear[], year: SchoolYear) {
  return (
    years
      .filter((row) => row.startsOn >= year.endsBefore)
      .toSorted((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null
  );
}

/**
 * A year of this school that still takes changes, held against a concurrent
 * close until the caller's transaction ends.
 */
export async function openYear(context: UnitContext, yearId: string) {
  const { years, year } = await yearOf(context, yearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  const lifecycle = await holdYear(context.tx, context.tenantId, year.id);
  if (!lifecycle) throw new ORPCError("NOT_FOUND");
  if (lifecycle === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  return { years, year };
}

/** A year as a span of days. */
export const daysOf = (year: Pick<SchoolYear, "startsOn" | "endsBefore">) => ({
  from: year.startsOn,
  to: year.endsBefore,
});

/** The year a class belongs to, or null for a class in none. */
export async function linkedYear(
  context: UnitContext,
  classId: string,
): Promise<SchoolYear | null> {
  const yearId = await yearOfClass(context.tx, context.tenantId, classId);
  if (!yearId) return null;
  return (
    (await schoolYears(context.tx, context.tenantId, context.schoolId)).find(
      (row) => row.id === yearId,
    ) ?? null
  );
}
