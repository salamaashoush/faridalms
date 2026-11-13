import type { ModuleFillings } from "~/utils/extension";

import { gradeWordingIn, gradeWordsIn } from "~/components/grade-levels/words";
import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** The words of a family applying for a place in a grade. */
export const ADMISSIONS_BY_GRADE_WITH_FAMILIES: ModuleFillings = {
  module: "admissions",
  needs: ["grade_levels", "families"],
  fillings: (wording) => {
    const words = gradeWordsIn(gradeWordingIn(wording));
    return [
      replaceWords(m.itkSectionChecklistHintCore, words.intakeChecklist),
      replaceWords(m.setupAdmissionsBodyCore, words.setupAdmissions),
      replaceWords(m.applyIntakeHintCore, words.applyHint),
    ];
  },
};
