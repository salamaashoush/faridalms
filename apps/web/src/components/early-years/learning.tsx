import type { ModuleFillings } from "~/utils/extension";

import { youngLessons } from "~/components/learning/slots";
import { fill } from "~/utils/extension";

/** Lessons and practice set as young children meet them, where the school has e-learning. */
export const EARLY_YEARS_IN_LESSONS: ModuleFillings = {
  module: "early_years",
  needs: ["elearning"],
  fillings: [fill(youngLessons, true)],
};
