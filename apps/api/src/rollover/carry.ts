import type { SchoolYear } from "@faridalms/database/stores/years";
import type { RolloverClass } from "@faridalms/domain/rollover";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** A class of the source year a rollover proposes to carry into the next. */
export interface SourceClass {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  gradeId: string | null;
  locationId: string | null;
  teacherId: string | null;
  subjects: { subjectId: string; teacherId: string | null }[];
}

/**
 * The classes a rollover carries into the next year and how a student
 * joins one; without a carrier it carries none and places students only.
 */
export interface RolloverCarrier {
  sources(context: UnitContext, year: SchoolYear): Promise<SourceClass[]>;
  /** The source class each student is in on the day. */
  classesOf(
    context: UnitContext,
    studentIds: readonly string[],
    on: string,
  ): Promise<Map<string, string>>;
  carry(
    context: UnitContext,
    target: SchoolYear,
    row: RolloverClass,
  ): Promise<string>;
  join(
    context: UnitContext,
    input: { classId: string; studentId: string; target: SchoolYear },
  ): Promise<void>;
}

export const rolloverCarriers = point<RolloverCarrier>("rollover carriers");

export async function carrierOf(
  context: UnitContext,
): Promise<RolloverCarrier | null> {
  return (await contributionsTo(context, rolloverCarriers))[0] ?? null;
}
