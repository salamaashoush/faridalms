import { schoolYears } from "@faridalms/database/stores/years";
import { badgeYearEnd } from "@faridalms/domain/badges";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { badgeEnds } from "./points";

/** A badge printed in a school year stops at its end. */
export const BADGES_IN_YEARS: ModuleContributions = {
  module: "badges",
  needs: ["school_years"],
  contributions: [
    contribute(badgeEnds, {
      endOf: async (scope, input) =>
        badgeYearEnd(
          await schoolYears(scope.tx, scope.tenantId, scope.schoolId),
          input.today,
          input.otherwise,
        ),
    }),
  ],
};
