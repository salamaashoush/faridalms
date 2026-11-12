import { timetableReady } from "@faridalms/database/stores/timetable";

import type { ModuleContributions } from "../core/extension";

import { homeClasses } from "../classes/points";
import { contribute } from "../core/extension";
import { can } from "../core/procedure";
import { setupMeasures } from "../core/setup";
import { studentRecordAccess } from "../people/points";
import { TIMETABLE_LINES } from "./notice-lines";
import { learnerClassesToday } from "./today";

/**
 * The setup step the timetable makes, classes meeting on it, and the
 * classes a learner's home lists: those they meet today.
 */
export const TIMETABLE: ModuleContributions = {
  module: "timetable",
  contributions: [
    ...TIMETABLE_LINES,
    contribute(studentRecordAccess, {
      key: "timetable",
      may: (context) => can(context, "timetable:read"),
    }),
    contribute(setupMeasures, {
      item: "timetable_ready",
      seen: (scope, today) =>
        timetableReady(scope.tx, {
          tenantId: scope.tenantId,
          orgId: scope.schoolId,
          today,
        }),
    }),
    contribute(homeClasses, { classesOf: learnerClassesToday }),
  ],
};
