import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** The student list's caption, which names the grade beside the homeroom teacher. */
export const HOMEROOMS_WITH_GRADES: ModuleFillings = {
  module: "homerooms",
  needs: ["grade_levels"],
  fillings: [replaceWords(m.adminStudentsCaptionCore, m.adminStudentsCaption)],
};
