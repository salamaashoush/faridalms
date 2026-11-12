import { homeroomClassIds } from "@faridalms/database/stores/homerooms";

import type { ModuleContributions } from "../core/extension";

import { dailyRegisters } from "../attendance/daily-registers";
import { contribute } from "../core/extension";

/** A homeroom takes the register for the day, where attendance is kept. */
export const HOMEROOMS_IN_ATTENDANCE: ModuleContributions = {
  module: "homerooms",
  needs: ["attendance"],
  contributions: [
    contribute(dailyRegisters, {
      classIds: (context, during) =>
        homeroomClassIds(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          during,
        }),
    }),
  ],
};
