import type {
  ClassesViewed,
  ClassLabel,
} from "@faridalms/database/stores/classes";
import type { EnrollmentSource } from "@faridalms/database/tables/teaching";
import type { Views } from "@faridalms/domain/classes";
import type { OpenSpan } from "@faridalms/domain/school";

import { classLabels } from "@faridalms/database/stores/classes";
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
  /**
   * Why nothing more is recorded for a class: its registers, its lessons
   * on the timetable and their cover, as in a closed year.
   */
  settles?(context: UnitContext, classId: string): Promise<string | null>;
  refusesRuns?(
    context: UnitContext,
    classId: string,
    runs: OpenSpan,
  ): Promise<string | null>;
  refusesEnding?(
    context: UnitContext,
    enrolment: EnrolmentEnding,
  ): Promise<string | null>;
  /** Why a student may not leave these classes from a day: a register that marks them after it, say. */
  refusesLeaving?(
    context: UnitContext,
    input: { studentId: string; classIds: readonly string[]; from: string },
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

/** Why nothing more is recorded for a class, or null. */
export const settlementOf = (context: UnitContext, classId: string) =>
  firstRefusal(context, (guard) => guard.settles?.(context, classId) ?? null);

/** Refuses to record anything more for a class a module has settled, as in a closed year. */
export async function requireUnsettled(context: UnitContext, classId: string) {
  const refusal = await settlementOf(context, classId);
  if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
}

/** Why an enrolment may not be ended by hand, or null. */
export const endingRefusal = (
  context: UnitContext,
  enrolment: EnrolmentEnding,
) =>
  firstRefusal(
    context,
    (guard) => guard.refusesEnding?.(context, enrolment) ?? null,
  );

/** Why a student may not leave these classes from a day, or null. */
export const leavingRefusal = (
  context: UnitContext,
  input: { studentId: string; classIds: readonly string[]; from: string },
) =>
  firstRefusal(
    context,
    (guard) => guard.refusesLeaving?.(context, input) ?? null,
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

/**
 * A module's narrowing of a list of classes: the classes it names, read on
 * a day, or with `within` only, classes it keeps among those the list
 * shows on its own days.
 */
export interface ClassSelection {
  classIds: readonly string[] | null;
  /** The classes a filter keeps, whichever days the list shows. */
  within?: readonly string[] | null;
  on: string;
  /** No class is added to the view or changed in it, as in a closed year. */
  settled?: boolean;
  /** What the view is called where a page names it: a year's title, say. */
  title?: { titleEn: string | null; titleAr: string | null };
}

/** What a view is given from the address: one value, several, or none. */
export type ViewValue = string | readonly string[] | null;

/**
 * A view of the school's classes a module offers under its key, such as the
 * classes of a year or of some grades. Given no value it applies its
 * default, or none.
 */
export interface ClassView {
  key: string;
  /** The view keeps classes among those listed rather than naming the list: a grade, say. */
  filter?: boolean;
  select(
    context: UnitContext,
    value: ViewValue,
  ): Promise<{
    classIds: readonly string[];
    on: string;
    settled?: boolean;
    title?: ClassSelection["title"];
  } | null>;
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
  let within: string[] | null = null;
  for (const view of offered) {
    const selected = await view.select(context, views[view.key] ?? null);
    if (!selected) continue;
    if (view.filter) {
      within = (within ?? [...selected.classIds]).filter((id) =>
        selected.classIds.includes(id),
      );
      continue;
    }
    result = result
      ? {
          classIds: (result.classIds ?? []).filter((id) =>
            selected.classIds.includes(id),
          ),
          on: result.on,
          settled: Boolean(result.settled || selected.settled),
          title: result.title ?? selected.title,
        }
      : selected;
  }
  if (!within) return result;
  return result
    ? { ...result, within }
    : { classIds: null, within, on: context.today };
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

/**
 * What a module says of each class in a list, under its key: the grade it
 * teaches, say, as an id the module's own options name. `order` ranks the
 * values, so a list sorts by them before its name.
 */
export interface ClassColumn {
  key: string;
  valuesOf(
    context: UnitContext,
    classIds: readonly string[],
  ): Promise<Map<string, string>>;
  order?(context: UnitContext): Promise<readonly string[]>;
}

export const classColumns = point<ClassColumn>("class columns");

/** Each column the modules on give the classes, by key and class. */
export async function classColumnsOf(
  context: UnitContext,
  classIds: readonly string[],
): Promise<{
  values: Record<string, Record<string, string>>;
  rank: (classId: string) => number;
}> {
  const values: Record<string, Record<string, string>> = {};
  const ranks: ((classId: string) => number)[] = [];
  for (const column of await contributionsTo(context, classColumns)) {
    const found = await column.valuesOf(context, classIds);
    values[column.key] = Object.fromEntries(found);
    if (column.order) {
      const order = await column.order(context);
      ranks.push((classId) => {
        const index = order.indexOf(found.get(classId) ?? "");
        return index < 0 ? order.length : index;
      });
    }
  }
  return {
    values,
    rank: (classId) => ranks[0]?.(classId) ?? 0,
  };
}

/**
 * A list of classes with each module's column, sorted by the first column
 * that ranks its values and then as listed: by name, where no module ranks.
 */
export async function withClassColumns<T extends { id: string }>(
  context: UnitContext,
  rows: readonly T[],
): Promise<{ rows: T[]; columns: Record<string, Record<string, string>> }> {
  const { values, rank } = await classColumnsOf(
    context,
    rows.map((row) => row.id),
  );
  return {
    rows: rows
      .map((row, index) => ({ row, index }))
      .toSorted((a, b) => rank(a.row.id) - rank(b.row.id) || a.index - b.index)
      .map((item) => item.row),
    columns: values,
  };
}

/** What each module's column says of one class, by key. */
export async function classColumnsAt(
  context: UnitContext,
  classId: string,
): Promise<Record<string, string | null>> {
  const { values } = await classColumnsOf(context, [classId]);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value[classId] ?? null]),
  );
}

/** A module that knows which classes are of young children. */
export interface YoungClasses {
  youngAmong(
    context: UnitContext,
    classIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}

export const youngClasses = point<YoungClasses>("young classes");

/** Which of the classes are of young children, as the modules on know them. */
export async function youngClassesOf(
  context: UnitContext,
  classIds: readonly string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (classIds.length === 0) return result;
  for (const contribution of await contributionsTo(context, youngClasses))
    for (const id of await contribution.youngAmong(context, classIds))
      result.add(id);
  return result;
}

/** What the modules on say of one class: each column's value, and whether it is of young children. */
export async function classFactsOf(context: UnitContext, classId: string) {
  return {
    young: (await youngClassesOf(context, [classId])).has(classId),
    columns: await classColumnsAt(context, classId),
  };
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

/** The classes a list of work shows, and the day it reads them on. */
export interface ClassesInView extends ClassesViewed {
  /** No class in the view takes changes, as in a closed year. */
  settled: boolean;
  title: ClassSelection["title"];
}

/**
 * The classes running today or yet to start, whatever a module's view: the
 * classes work and modules are set for.
 */
export const currentClasses = (context: UnitContext): ClassesViewed => ({
  on: context.today,
  classIds: null,
  ended: false,
});

/**
 * The classes a list of a school's work shows: those a module's view names
 * (the working year's, given none), else those still running or yet to
 * start, or with `ended` those over.
 */
export async function classesInView(
  context: UnitContext,
  input: { views?: Views; ended?: boolean } = {},
): Promise<ClassesInView> {
  const view = await classViewOf(context, input.views ?? {});
  return view
    ? {
        on: view.on,
        classIds: view.classIds,
        within: view.within ?? null,
        ended: view.classIds ? false : (input.ended ?? false),
        settled: Boolean(view.settled),
        title: view.title,
      }
    : {
        on: context.today,
        classIds: null,
        ended: input.ended ?? false,
        settled: false,
        title: undefined,
      };
}

/**
 * A module that knows which of a learner's classes their home lists: the
 * classes of the lessons they have today, say.
 */
export interface HomeClasses {
  classesOf(context: UnitContext, studentId: string): Promise<ClassLabel[]>;
}

export const homeClasses = point<HomeClasses>("home classes");

/**
 * The classes a learner's home lists: those a module on names, else every
 * class they are in.
 */
export async function learnerHomeClasses(
  context: UnitContext,
  input: { studentId: string; classIds: readonly string[] },
): Promise<ClassLabel[]> {
  const named = (await contributionsTo(context, homeClasses))[0];
  if (named) return named.classesOf(context, input.studentId);
  return [
    ...(
      await classLabels(context.tx, context.tenantId, input.classIds)
    ).values(),
  ];
}
