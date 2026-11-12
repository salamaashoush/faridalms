import {
  classesOfModule,
  classesWithUnits,
} from "@faridalms/database/stores/learning";

import type { UnitContext } from "../core/context";

import { youngClassesOf } from "../classes/points";

/** A module's classes, each saying whether it is of young children. */
export async function moduleClasses(context: UnitContext, moduleId: string) {
  const rows = await classesOfModule(context.tx, context.tenantId, moduleId);
  const young = await youngClassesOf(
    context,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, young: young.has(row.id) }));
}

/**
 * The class a year map opens on: the first that takes a module, so the map
 * shows units, else the first of all.
 */
export async function firstWithUnits(
  context: UnitContext,
  classes: readonly { id: string }[],
): Promise<string> {
  const [taking] = await classesWithUnits(
    context.tx,
    context.tenantId,
    classes.map((row) => row.id),
  );
  return taking ?? classes[0]?.id ?? "";
}
