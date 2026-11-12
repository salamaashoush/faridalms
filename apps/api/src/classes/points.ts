import type { EnrollmentSource } from "@faridalms/database/tables/teaching";
import type { Views } from "@faridalms/domain/classes";
import type { OpenSpan } from "@faridalms/domain/school";

import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

export interface EnrolmentEnding {
  id: string;
  classId: string;
  userId: string;
  source: EnrollmentSource;
}

/**
 * A module that keeps something of a class in step refuses what would put
 * it out of step: changing the class at all, moving its dates, or ending an
 * enrolment it keeps. Each answers an error code, or null to allow it.
 */
export interface ClassGuard {
  refusesChange?(context: UnitContext, classId: string): Promise<string | null>;
  refusesRuns?(
    context: UnitContext,
    classId: string,
    runs: OpenSpan,
  ): Promise<string | null>;
  refusesEnding?(
    context: UnitContext,
    enrolment: EnrolmentEnding,
  ): Promise<string | null>;
}

export const classGuards = point<ClassGuard>("class guards");

async function firstRefusal(
  context: UnitContext,
  ask: (guard: ClassGuard) => Promise<string | null> | null,
): Promise<string | null> {
  for (const guard of await contributionsTo(context, classGuards)) {
    const refusal = await ask(guard);
    if (refusal) return refusal;
  }
  return null;
}

/** Why a class may not be changed now, or null. */
export const changeRefusal = (context: UnitContext, classId: string) =>
  firstRefusal(
    context,
    (guard) => guard.refusesChange?.(context, classId) ?? null,
  );

/** Why a class may not run over these days, or null. */
export const runsRefusal = (
  context: UnitContext,
  classId: string,
  runs: OpenSpan,
) =>
  firstRefusal(
    context,
    (guard) => guard.refusesRuns?.(context, classId, runs) ?? null,
  );

/** Why an enrolment may not be ended by hand, or null. */
export const endingRefusal = (
  context: UnitContext,
  enrolment: EnrolmentEnding,
) =>
  firstRefusal(
    context,
    (guard) => guard.refusesEnding?.(context, enrolment) ?? null,
  );

/** Refuses a change to a class some module keeps from changing. */
export async function requireChangeable(context: UnitContext, classId: string) {
  const refusal = await changeRefusal(context, classId);
  if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
}

/** The group of students a class is, or is taught to. */
export interface ClassGroup {
  classId: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  /** The class is the group itself rather than a class taught to it. */
  own: boolean;
}

export interface ClassGroups {
  groupsOf(
    context: UnitContext,
    classIds: readonly string[],
  ): Promise<Map<string, ClassGroup>>;
}

export const classGroups = point<ClassGroups>("class groups");

/** The group each class is or is taught to, where a module gives one. */
export async function classGroupsOf(
  context: UnitContext,
  classIds: readonly string[],
): Promise<Map<string, ClassGroup>> {
  const result = new Map<string, ClassGroup>();
  if (classIds.length === 0) return result;
  for (const contribution of await contributionsTo(context, classGroups))
    for (const [classId, group] of await contribution.groupsOf(
      context,
      classIds,
    ))
      if (!result.has(classId)) result.set(classId, group);
  return result;
}

/** A module's narrowing of a list of classes: the classes it names, read on a day. */
export interface ClassSelection {
  classIds: readonly string[];
  on: string;
  /** No class is added to the view or changed in it, as in a closed year. */
  settled?: boolean;
  /** What the view is called where a page names it: a year's title, say. */
  title?: { titleEn: string | null; titleAr: string | null };
}

/**
 * A view of the school's classes a module offers under its key, such as the
 * classes of a year. Given no value it applies its default, or none.
 */
export interface ClassView {
  key: string;
  select(
    context: UnitContext,
    value: string | null,
  ): Promise<ClassSelection | null>;
}

export const classViews = point<ClassView>("class views");

/**
 * The classes the modules' views narrow a list to and the day it is read
 * on, or null where none narrows it. A key no module on answers for is
 * refused.
 */
export async function classViewOf(
  context: UnitContext,
  views: Views,
): Promise<ClassSelection | null> {
  const offered = await contributionsTo(context, classViews);
  const unknown = Object.keys(views).find(
    (key) => !offered.some((view) => view.key === key),
  );
  if (unknown)
    throw new ORPCError("BAD_REQUEST", { message: "classes.view_unknown" });
  let result: ClassSelection | null = null;
  for (const view of offered) {
    const selected = await view.select(context, views[view.key] ?? null);
    if (!selected) continue;
    result = result
      ? {
          classIds: result.classIds.filter((id) =>
            selected.classIds.includes(id),
          ),
          on: result.on,
          settled: Boolean(result.settled || selected.settled),
          title: result.title ?? selected.title,
        }
      : selected;
  }
  return result;
}

/**
 * What a module keeps about a class, saved with the class from its form
 * under the module's key: the year it belongs to, say. `value` is read by
 * the module's own schema; `classIds` are every class the form made or
 * changed together, `runs` their days.
 */
export interface ClassFormPart {
  key: string;
  save(
    context: UnitContext,
    input: {
      classIds: readonly string[];
      runs: OpenSpan;
      value: unknown;
      created: boolean;
    },
  ): Promise<void>;
}

export const classFormParts = point<ClassFormPart>("class form parts");

/** Saves what modules keep about classes from their form; a part no module on answers for is refused. */
export async function saveClassParts(
  context: UnitContext,
  input: {
    classIds: readonly string[];
    runs: OpenSpan;
    parts: Readonly<Record<string, unknown>>;
    created: boolean;
  },
) {
  const offered = await contributionsTo(context, classFormParts);
  for (const key of Object.keys(input.parts))
    if (!offered.some((part) => part.key === key))
      throw new ORPCError("BAD_REQUEST", { message: "classes.part_unknown" });
  for (const part of offered)
    if (part.key in input.parts)
      await part.save(context, {
        classIds: input.classIds,
        runs: input.runs,
        value: input.parts[part.key],
        created: input.created,
      });
}

/** A module that keeps something in step with students joining classes. */
export interface ClassJoins {
  joined(
    context: UnitContext,
    joins: ReadonlyMap<string, readonly string[]>,
    from: string,
  ): Promise<void>;
}

export const classJoins = point<ClassJoins>("class joins");
