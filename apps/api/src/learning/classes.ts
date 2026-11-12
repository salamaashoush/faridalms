import { classesOfModule } from "@faridalms/database/stores/learning";

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
