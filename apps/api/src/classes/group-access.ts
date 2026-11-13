import type { UnitContext } from "../core/context";

import { can } from "../core/procedure";
import { teaches } from "../core/reach";

/** Whether the viewer keeps the class's groups: they set work and teach it, or reach all teaching. */
export async function keepsGroups(context: UnitContext, classId: string) {
  return (
    can(context, "assignments:author") &&
    (await teaches(context, "teaching", classId))
  );
}
