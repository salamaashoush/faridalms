import type { ModuleFillings } from "~/utils/extension";

import { setupStepWords } from "~/components/home/slots";
import { fill } from "~/utils/extension";

import { gradeWordingIn, gradeWordsIn } from "./words";

/** A school of grades, years and homerooms sets up each year's classes grade by grade. */
export const GRADE_LEVELS_IN_SETUP: ModuleFillings = {
  module: "grade_levels",
  needs: ["school_years", "homerooms"],
  fillings: (wording) => {
    const words = gradeWordsIn(gradeWordingIn(wording));
    return [
      fill(setupStepWords, {
        id: "classes",
        title: words.setupTitle,
        body: words.setupBody,
        capability: "classes:manage",
        link: { to: "/classes", search: {} },
      }),
    ];
  },
};
