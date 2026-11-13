import type { ModuleFillings } from "~/utils/extension";

import { gradeWordingIn, gradeWordsIn } from "~/components/grade-levels/words";
import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** Enrolling an offer as a student of a grade for the year, with the family as guardians. */
export const ADMISSIONS_BY_GRADE_WITH_FAMILIES_IN_YEARS: ModuleFillings = {
  module: "admissions",
  needs: ["grade_levels", "families", "school_years"],
  fillings: (wording) => [
    replaceWords(
      m.brdEnrolBodyCore,
      gradeWordsIn(gradeWordingIn(wording)).enrolBody,
    ),
  ],
};
