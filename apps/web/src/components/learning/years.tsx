import type { ModuleFillings } from "~/utils/extension";

import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

/** The year map lays a class's units along its school year. */
export const ELEARNING_IN_YEARS: ModuleFillings = {
  module: "elearning",
  needs: ["school_years"],
  fillings: [fill(modulePages, ["/year-map"])],
};
