import type { ClassLabel } from "@faridalms/database/stores/classes";

import { classLabels } from "@faridalms/database/stores/classes";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/**
 * Grids wider than one class: a module that plans classes together says
 * which class's grid each is placed in, and which classes a grid places.
 */
export interface TimetableGrids {
  /** The class whose grid each of these is planned in, for those not their own. */
  ownersOf(
    context: UnitContext,
    classIds: readonly string[],
  ): Promise<Map<string, string>>;
  /** The classes a grid places, or null when it is not one of this module's. */
  classesOf(context: UnitContext, ownerId: string): Promise<string[] | null>;
  /** The classes of a year planned in another class's grid. */
  plannedElsewhere(context: UnitContext, yearId: string): Promise<string[]>;
}

export const timetableGrids = point<TimetableGrids>("timetable grids");

/** The class whose grid each class is planned in: its own unless a module says. */
export async function gridOwnersOf(
  context: UnitContext,
  classIds: readonly string[],
): Promise<Map<string, string>> {
  const owners = new Map(classIds.map((id) => [id, id]));
  for (const contribution of await contributionsTo(context, timetableGrids))
    for (const [classId, owner] of await contribution.ownersOf(
      context,
      classIds,
    ))
      owners.set(classId, owner);
  return owners;
}

export async function gridOwnerOf(
  context: UnitContext,
  classId: string,
): Promise<string> {
  return (await gridOwnersOf(context, [classId])).get(classId) ?? classId;
}

/** The classes a grid places: the owner alone unless a module plans more. */
export async function gridClassIds(
  context: UnitContext,
  ownerId: string,
): Promise<string[]> {
  for (const contribution of await contributionsTo(context, timetableGrids)) {
    const classes = await contribution.classesOf(context, ownerId);
    if (classes) return classes;
  }
  return [ownerId];
}

/** The classes whose lessons a grid shows: the owner's own one-day lessons, and those it places. */
export async function gridLessonClassIds(
  context: UnitContext,
  ownerId: string,
): Promise<string[]> {
  return [...new Set([ownerId, ...(await gridClassIds(context, ownerId))])];
}

/** The classes of a year that own no grid, being planned in another's. */
export async function plannedElsewhere(
  context: UnitContext,
  yearId: string,
): Promise<string[]> {
  const found = await Promise.all(
    (await contributionsTo(context, timetableGrids)).map((contribution) =>
      contribution.plannedElsewhere(context, yearId),
    ),
  );
  return [...new Set(found.flat())];
}

/** The grid each class is planned in, named as its owning class. */
export async function gridsOf(
  context: UnitContext,
  classIds: readonly string[],
): Promise<Map<string, ClassLabel>> {
  const owners = await gridOwnersOf(context, [...new Set(classIds)]);
  const labels = await classLabels(context.tx, context.tenantId, [
    ...new Set(owners.values()),
  ]);
  const result = new Map<string, ClassLabel>();
  for (const [classId, owner] of owners) {
    const label = labels.get(owner);
    if (label) result.set(classId, label);
  }
  return result;
}
