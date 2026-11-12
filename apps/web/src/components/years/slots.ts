import type { RolloverClass } from "@faridalms/domain/rollover";

import { slot } from "~/utils/extension";

/** How a module that carries classes over a rollover names what it carries. */
export interface RolloverCarrierWords {
  /** The carrier's key, as the plan's rows name it. */
  carrier: string;
  /** What goes over with a row, under its fields. */
  describe(row: RolloverClass): string;
  /** How the class's primary teacher is named. */
  teacher: () => string;
}

export const rolloverCarrierWords = slot<RolloverCarrierWords>(
  "rollover carrier words",
);
