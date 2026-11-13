import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

import { gradeWordingIn, gradeWordsIn } from "./words";

/** Sentences naming both a grade and the families it reaches, in the school's word for a grade. */
export const GRADE_LEVELS_WITH_FAMILIES: ModuleFillings = {
  module: "grade_levels",
  needs: ["families"],
  fillings: (wording) => {
    const words = gradeWordsIn(gradeWordingIn(wording));
    return [replaceWords(m.annAudienceHintCore, words.audienceReachesFamilies)];
  },
};
