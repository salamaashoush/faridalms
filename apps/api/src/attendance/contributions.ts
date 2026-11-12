import { registerOutside } from "@faridalms/database/stores/attendance";

import type { ModuleContributions } from "../core/extension";

import { classGuards } from "../classes/points";
import { contribute } from "../core/extension";

/** What attendance tells the rest of the product, wherever it asks. */
export const ATTENDANCE: ModuleContributions = {
  module: "attendance",
  contributions: [
    contribute(classGuards, {
      refusesRuns: async (context, classId, runs) => {
        const day = await registerOutside(context.tx, {
          tenantId: context.tenantId,
          classId,
          runs,
        });
        return day ? `class.registers_outside:${day}` : null;
      },
    }),
  ],
};
