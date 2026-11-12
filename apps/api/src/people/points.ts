import type { GivenStudents } from "@faridalms/database/stores/students";
import type { Views } from "@faridalms/domain/classes";

import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** A module's narrowing of the student list: the students it names, read on a day. */
export interface StudentSelection extends GivenStudents {
  on: string;
}

/**
 * A view of the school's students a module offers under its key, such as a
 * year's, with the status and grade it gives each. Given no value it
 * applies its default, or none.
 */
export interface StudentView {
  key: string;
  select(
    context: UnitContext,
    value: string | null,
  ): Promise<StudentSelection | null>;
}

export const studentViews = point<StudentView>("student views");

/** The students a module's view narrows the list to, or null; a key no module on answers for is refused. */
export async function studentViewOf(
  context: UnitContext,
  views: Views,
): Promise<StudentSelection | null> {
  const offered = await contributionsTo(context, studentViews);
  if (Object.keys(views).some((key) => !offered.some((v) => v.key === key)))
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
