import type { ModuleFillings } from "~/utils/extension";

import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

/** The curriculum map reads the unit plans e-learning keeps. */
export const STANDARDS_IN_LESSONS: ModuleFillings = {
  module: "standards",
  needs: ["elearning"],
  fillings: [fill(modulePages, ["/standards/map"])],
};
