import type { RolloverClass } from "@faridalms/domain/rollover";
import type { OpenSpan } from "@faridalms/domain/school";

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

/** What a carrier proposes: a class it carries with the classes it carries with it. */
export interface CarriedSource extends SourceClass {
  /** Classes carried as part of this one, which no one else carries. */
  partIds: string[];
}

/**
 * A module that keeps some classes in its own shape carries them into the
 * next year itself: which of the year's classes it carries, how each student
 * sits in one, and how a student joins the one carried. A class no carrier
 * claims is carried as a class of its own.
 */
export interface RolloverCarrier {
  key: string;
  /** The classes among these this carrier carries, each with its parts. */
  sources(
    context: UnitContext,
    classIds: readonly string[],
    on: string,
  ): Promise<CarriedSource[]>;
  /** The class each student is in on the day, of those this carrier carries. */
  classesOf(
    context: UnitContext,
    studentIds: readonly string[],
    on: string,
  ): Promise<Map<string, string>>;
  /** Creates the carried class over the days; answers it and every class made with it. */
  carry(
    context: UnitContext,
    runs: OpenSpan,
    row: RolloverClass,
  ): Promise<{ classId: string; classIds: string[] }>;
  join(
    context: UnitContext,
    input: {
      classId: string;
      studentId: string;
      from: string;
      until: string | null;
    },
  ): Promise<void>;
}

export const rolloverCarriers = point<RolloverCarrier>("rollover carriers");

export async function carriersOf(
  context: UnitContext,
): Promise<RolloverCarrier[]> {
  return contributionsTo(context, rolloverCarriers);
}
