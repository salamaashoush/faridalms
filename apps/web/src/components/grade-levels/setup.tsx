import type { ModuleFillings } from "~/utils/extension";

import { setupStepWords } from "~/components/home/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

/** A school of grades, years and homerooms sets up each year's classes grade by grade. */
export const GRADE_LEVELS_IN_SETUP: ModuleFillings = {
  module: "grade_levels",
  needs: ["school_years", "homerooms"],
  fillings: [
    fill(setupStepWords, {
      id: "classes",
      title: m.setupClassesTitle,
      body: m.setupClassesBody,
      capability: "classes:manage",
      link: { to: "/classes", search: {} },
    }),
  ],
};
