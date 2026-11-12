import type { GivenStudents } from "@faridalms/database/stores/students";
import type { Views } from "@faridalms/domain/classes";

import { ORPCError } from "@orpc/server";

import type { ViewValue } from "../classes/points";
import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/** A module's narrowing of the student list: the students it names, read on a day. */
export interface StudentSelection extends GivenStudents {
  on: string;
}

/**
 * A view of the school's students a module offers under its key, such as a
 * year's, with the status it gives each. Given no value it applies its
 * default, or none.
 */
export interface StudentView {
  key: string;
  select(
    context: UnitContext,
    value: ViewValue,
  ): Promise<StudentSelection | null>;
}

export const studentViews = point<StudentView>("student views");

/**
 * The students a module's view narrows the list to, or null; a key no
 * module on answers for, as a view or a column, is refused.
 */
export async function studentViewOf(
  context: UnitContext,
  views: Views,
): Promise<StudentSelection | null> {
  const offered = await contributionsTo(context, studentViews);
  const columns = await contributionsTo(context, studentColumns);
  if (
    Object.keys(views).some(
      (key) =>
        !offered.some((v) => v.key === key) &&
        !columns.some((column) => column.key === key),
    )
  )
    throw new ORPCError("BAD_REQUEST", { message: "people.view_unknown" });
  for (const view of offered) {
    const selected = await view.select(context, views[view.key] ?? null);
    if (selected) return selected;
  }
  return null;
}

/** What a module keeps about a student, saved with the student from its form under the module's key. */
export interface StudentFormPart {
  key: string;
  save(
    context: UnitContext,
    input: { studentId: string; value: unknown },
  ): Promise<void>;
}

export const studentFormParts = point<StudentFormPart>("student form parts");

/** A part sent for a module no school module answers for is refused. */
async function partsOf<T extends { key: string }>(
  context: UnitContext,
  parts: Readonly<Record<string, unknown>>,
  offered: readonly T[],
) {
  for (const key of Object.keys(parts))
    if (!offered.some((part) => part.key === key))
      throw new ORPCError("BAD_REQUEST", { message: "people.part_unknown" });
  return offered;
}

export async function saveStudentParts(
  context: UnitContext,
  input: { studentId: string; parts: Readonly<Record<string, unknown>> },
) {
  for (const part of await partsOf(
    context,
    input.parts,
    await contributionsTo(context, studentFormParts),
  ))
    if (part.key in input.parts)
      await part.save(context, {
        studentId: input.studentId,
        value: input.parts[part.key],
      });
}

/**
 * What a module records when a student leaves, and gives back when the
 * departure is taken back. `leave` answers what it ended, which the
 * departure keeps for `cancel`.
 */
export interface LeavingPart {
  key: string;
  leave(
    context: UnitContext,
    input: { studentId: string; leftOn: string; value: unknown },
  ): Promise<unknown>;
  cancel(
    context: UnitContext,
    input: { studentId: string; ended: unknown },
  ): Promise<void>;
}

export const leavingParts = point<LeavingPart>("leaving parts");

/** Records each module's part of a departure and answers what each ended, by key. */
export async function leaveParts(
  context: UnitContext,
  input: {
    studentId: string;
    leftOn: string;
    parts: Readonly<Record<string, unknown>>;
  },
): Promise<Record<string, unknown>> {
  const ended: Record<string, unknown> = {};
  for (const part of await partsOf(
    context,
    input.parts,
    await contributionsTo(context, leavingParts),
  ))
    ended[part.key] = await part.leave(context, {
      studentId: input.studentId,
      leftOn: input.leftOn,
      value: input.parts[part.key],
    });
  return ended;
}

/** Gives back what each module on ended with a departure. */
export async function cancelParts(
  context: UnitContext,
  input: { studentId: string; ended: Readonly<Record<string, unknown>> },
) {
  for (const part of await contributionsTo(context, leavingParts))
    if (part.key in input.ended)
      await part.cancel(context, {
        studentId: input.studentId,
        ended: input.ended[part.key],
      });
}

/**
 * What a module says of each student on a day, under its key: their grade,
 * say, as an id its own options name, in the order it ranks them. The
 * student list shows it as a column, filters by it under the same key and
 * sorts by it.
 */
export interface StudentColumn {
  key: string;
  valuesOn(
    context: UnitContext,
    on: string,
  ): Promise<{ order: readonly string[]; values: ReadonlyMap<string, string> }>;
}

export const studentColumns = point<StudentColumn>("student columns");

export async function studentColumnsOn(context: UnitContext, on: string) {
  const columns = await contributionsTo(context, studentColumns);
  return Promise.all(
    columns.map(async (column) => ({
      key: column.key,
      ...(await column.valuesOn(context, on)),
    })),
  );
}

/** A module that knows which students are young children. */
export interface YoungStudents {
  youngAmong(
    context: ModuleScope,
    studentIds: readonly string[],
    on: string,
  ): Promise<ReadonlySet<string>>;
}

export const youngStudents = point<YoungStudents>("young students");

/** Which of the students are young children on the day, as the modules on know them. */
export async function youngStudentsOf(
  context: ModuleScope,
  studentIds: readonly string[],
  on: string,
): Promise<Set<string>> {
  const result = new Set<string>();
  if (studentIds.length === 0) return result;
  for (const contribution of await contributionsTo(context, youngStudents))
    for (const id of await contribution.youngAmong(context, studentIds, on))
      result.add(id);
  return result;
}

/** A word a module places a student by on a day: their grade, say. */
export interface StudentPlace {
  labelEn: string | null;
  labelAr: string | null;
}

export interface StudentPlaces {
  placesOf(
    context: UnitContext,
    studentIds: readonly string[],
    on: string,
  ): Promise<Map<string, StudentPlace>>;
}

export const studentPlaces = point<StudentPlaces>("student places");

/** Where each student is placed on the day, where a module places them. */
export async function studentPlacesOf(
  context: UnitContext,
  studentIds: readonly string[],
  on: string,
): Promise<Map<string, StudentPlace>> {
  const result = new Map<string, StudentPlace>();
  if (studentIds.length === 0) return result;
  for (const contribution of await contributionsTo(context, studentPlaces))
    for (const [id, place] of await contribution.placesOf(
      context,
      studentIds,
      on,
    ))
      if (!result.has(id)) result.set(id, place);
  return result;
}

/**
 * The modules' columns of the student list on a day, read for one page of
 * it: the students a column's filter in `views` leaves, the ranks the
 * chosen sort orders by, and each student's values.
 */
export async function studentListColumns(
  context: UnitContext,
  input: { views: Views; sort: string; on: string },
) {
  const columns = await studentColumnsOn(context, input.on);
  const sorted = columns.find((column) => column.key === input.sort);
  if (input.sort !== "name" && input.sort !== "reference" && !sorted)
    throw new ORPCError("BAD_REQUEST", { message: "people.sort_unknown" });
  let within: Set<string> | null = null;
  for (const column of columns) {
    const value = input.views[column.key];
    if (value === undefined) continue;
    const selected = new Set(typeof value === "string" ? [value] : value);
    const ids = [...column.values]
      .filter(([, item]) => selected.has(item))
      .map(([id]) => id);
    within = new Set(within ? ids.filter((id) => within?.has(id)) : ids);
  }
  const ranked = sorted ? [...sorted.values] : [];
  return {
    within: within ? [...within] : null,
    sort: sorted ? ("rank" as const) : (input.sort as "name" | "reference"),
    ranks: sorted
      ? {
          ids: ranked.map(([id]) => id),
          ranks: ranked.map(([, value]) => sorted.order.indexOf(value)),
        }
      : null,
    valuesOf: (studentId: string) =>
      Object.fromEntries(
        columns.map((column) => [
          column.key,
          column.values.get(studentId) ?? null,
        ]),
      ),
  };
}

/** Students found, each with where a module places them today as the context they are shown in. */
export async function placed<T extends { id: string; context: string | null }>(
  context: UnitContext,
  rows: readonly T[],
  arabic: boolean,
): Promise<T[]> {
  const places = await studentPlacesOf(
    context,
    rows.map((row) => row.id),
    context.today,
  );
  return rows.map((row) => {
    const place = places.get(row.id);
    const label = place
      ? ((arabic ? place.labelAr : place.labelEn) ??
        place.labelEn ??
        place.labelAr)
      : null;
    return { ...row, context: label };
  });
}
