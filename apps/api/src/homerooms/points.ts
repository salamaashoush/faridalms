import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** A module that keeps something in step with students placed in homerooms. */
export interface HomeroomPlacement {
  placed(
    context: UnitContext,
    input: { studentId: string; homeroomClassId: string; from: string },
  ): Promise<void>;
}

export const homeroomPlacements = point<HomeroomPlacement>(
  "homeroom placements",
);

/** Tells the modules on that a student was placed in a homeroom from a day. */
export async function homeroomPlaced(
  context: UnitContext,
  input: { studentId: string; homeroomClassId: string; from: string },
) {
  for (const contribution of await contributionsTo(context, homeroomPlacements))
    await contribution.placed(context, input);
}
