import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

import { gradeWordingIn, gradeWordsIn } from "./words";

/** The programmes' hint, which speaks of a grade's work weighing in a term grade. */
export const GRADE_LEVELS_WITH_COURSEWORK_IN_YEARS: ModuleFillings = {
  module: "grade_levels",
  needs: ["coursework", "school_years"],
  fillings: (wording) => [
    replaceWords(
      m.gradingProgrammesHintCore,
      gradeWordsIn(gradeWordingIn(wording)).programmesHint,
    ),
  ],
};
