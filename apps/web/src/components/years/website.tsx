import type { ModuleFillings } from "~/utils/extension";

import { siteWords } from "~/components/site/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

/** The school's website speaks of the year an intake's tuition runs for. */
export const SCHOOL_YEARS_ON_WEBSITE: ModuleFillings = {
  module: "school_years",
  needs: ["website"],
  fillings: [
    fill(siteWords, {
      word: "year",
      neutral: m.itkFeeTuitionCore,
      words: m.itkFeeTuition,
    }),
  ],
};
