import type { ModuleFillings } from "~/utils/extension";

import { moduleSwitches } from "~/components/admin/slots";
import { classEditorParts } from "~/components/classes/slots";
import * as m from "~/i18n/messages";
import { youngClassPartQuery } from "~/queries/early-years";
import { fill } from "~/utils/extension";

import { YoungClassField } from "./YoungClassField";

/** Classes marked for young children, and the switch a school turns the early years on with. */
export const EARLY_YEARS: ModuleFillings = {
  module: "early_years",
  fillings: [
    fill(moduleSwitches, {
      module: "early_years",
      place: 20,
      name: m.earlyYearsFeatureToggle,
      hint: m.earlyYearsFeatureToggleHint,
    }),
    fill(classEditorParts, {
      key: "young",
      section: "details",
      query: (classId) => youngClassPartQuery(classId),
      initial: (read) => ({
        value: { young: (read as { young: boolean }).young },
      }),
      Field: YoungClassField,
    }),
  ],
};
