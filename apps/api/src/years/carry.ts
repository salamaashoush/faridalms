import type { PartValue } from "@faridalms/domain/classes";
import type { RolloverClass } from "@faridalms/domain/rollover";
import type { OpenSpan } from "@faridalms/domain/school";

import type { UnitContext } from "../core/context";

import { saveClassParts } from "../classes/points";
import { contributionsTo, point } from "../core/extension";

/** A class of the source year a rollover proposes to carry into the next. */
export interface SourceClass {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
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

/** A staying student and the class row of the plan they go on in, if any. */
export interface RolloverStay {
  studentId: string;
  /** The row's part under the module's key, as the plan holds it. */
  part: unknown;
}

/**
 * What a module gives the classes a rollover carries, under its key: their
 * grade, say. It proposes a value for each class carried from the source
 * year, the plan keeps it, the carried class saves it as a class form part
 * of the same key, and each staying student is given what their class's
 * row holds from the first day of the year.
 */
export interface RolloverPart {
  key: string;
  propose(
    context: UnitContext,
    sourceClassIds: readonly string[],
  ): Promise<Map<string, PartValue>>;
  stayed(
    context: UnitContext,
    input: { from: string; stays: readonly RolloverStay[] },
  ): Promise<void>;
}

export const rolloverParts = point<RolloverPart>("rollover parts");

/** What the modules on propose for each class carried from the source year, by key. */
export async function proposedParts(
  context: UnitContext,
  sources: readonly { id: string }[],
): Promise<(classId: string) => Record<string, PartValue>> {
  const proposed = new Map<string, Map<string, PartValue>>();
  for (const part of await contributionsTo(context, rolloverParts))
    proposed.set(
      part.key,
      await part.propose(
        context,
        sources.map((row) => row.id),
      ),
    );
  return (classId) =>
    Object.fromEntries(
      [...proposed].flatMap(([key, values]) => {
        const value = values.get(classId);
        return value ? [[key, value] as const] : [];
      }),
    );
}

/** Saves on the classes a plan's row made what the modules on keep for the row. */
export async function saveCarriedParts(
  context: UnitContext,
  input: { classIds: readonly string[]; runs: OpenSpan; row: RolloverClass },
) {
  const parts = await contributionsTo(context, rolloverParts);
  await saveClassParts(context, {
    classIds: input.classIds,
    runs: input.runs,
    parts: Object.fromEntries(
      parts.flatMap((part) =>
        part.key in input.row.parts
          ? [[part.key, input.row.parts[part.key]]]
          : [],
      ),
    ),
    created: true,
  });
}

/** Gives each staying student what each module keeps for the row they go on in. */
export async function partsStayed(
  context: UnitContext,
  input: {
    from: string;
    stays: readonly { studentId: string; row: RolloverClass | undefined }[];
  },
) {
  for (const part of await contributionsTo(context, rolloverParts))
    await part.stayed(context, {
      from: input.from,
      stays: input.stays.map((stay) => ({
        studentId: stay.studentId,
        part: stay.row?.parts[part.key],
      })),
    });
}
