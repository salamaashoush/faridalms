import type { ModuleFillings } from "~/utils/extension";

import { moduleSwitches } from "~/components/admin/slots";
import { youngLessons } from "~/components/learning/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

/** Lessons and practice set as young children meet them, and the switch a school turns them on with. */
export const EARLY_YEARS: ModuleFillings = {
  module: "early_years",
  fillings: [
    fill(moduleSwitches, {
      module: "early_years",
      place: 20,
      name: m.earlyYearsFeatureToggle,
      hint: m.earlyYearsFeatureToggleHint,
    }),
    fill(youngLessons, true),
  ],
};
