import type { ModuleFillings } from "~/utils/extension";

import { siteChoiceFields } from "~/components/site/slots";
import { fill } from "~/utils/extension";

/** The website's forms may ask which grade an enquiry is about. */
export const GRADE_LEVELS_ON_WEBSITE: ModuleFillings = {
  module: "grade_levels",
  needs: ["website"],
  fillings: [fill(siteChoiceFields, "grade")],
};
