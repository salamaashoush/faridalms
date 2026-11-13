import type { ModuleFillings } from "~/utils/extension";

import { gradeWordingIn, gradeWordsIn } from "~/components/grade-levels/words";
import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** The website's intake section, which may list the intakes of one grade. */
export const ADMISSIONS_BY_GRADE_ON_WEBSITE: ModuleFillings = {
  module: "admissions",
  needs: ["grade_levels", "website"],
  fillings: (wording) => [
    replaceWords(
      m.siteFieldIntakeHintCore,
      gradeWordsIn(gradeWordingIn(wording)).siteIntake,
    ),
  ],
};
