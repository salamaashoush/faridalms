import { timetableReady } from "@faridalms/database/stores/timetable";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { setupMeasures } from "../core/setup";

/** The setup step the timetable makes: classes meeting on it. */
export const TIMETABLE: ModuleContributions = {
  module: "timetable",
  contributions: [
    contribute(setupMeasures, {
      item: "timetable_ready",
      seen: (scope, today) =>
        timetableReady(scope.tx, {
          tenantId: scope.tenantId,
          orgId: scope.schoolId,
          today,
        }),
    }),
  ],
};
