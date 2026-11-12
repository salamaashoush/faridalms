import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";
import { replaceWords } from "~/utils/words";

/** The year map lays a class's units along its school year. */
export const ELEARNING_IN_YEARS: ModuleFillings = {
  module: "elearning",
  needs: ["school_years"],
  fillings: [
    fill(modulePages, ["/year-map"]),
    replaceWords(m.lrnNoClassesBodyCore, m.lrnNoClassesBody),
  ],
};
