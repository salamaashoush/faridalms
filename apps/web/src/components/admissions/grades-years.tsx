import type { ModuleFillings } from "~/utils/extension";

import { gradeWordingIn, gradeWordsIn } from "~/components/grade-levels/words";
import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** The words of intakes that admit into a grade for a school year. */
export const ADMISSIONS_BY_GRADE_IN_YEARS: ModuleFillings = {
  module: "admissions",
  needs: ["grade_levels", "school_years"],
  fillings: (wording) => {
    const words = gradeWordsIn(gradeWordingIn(wording));
    return [
      replaceWords(m.applyIntakeTitleCore, words.applyTitle),
      replaceWords(m.itkCaptionCore, words.intakeCaption),
    ];
  },
};
