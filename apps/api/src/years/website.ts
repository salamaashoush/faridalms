import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { siteWords } from "../website/points";

/** The school's website speaks of the year an intake's tuition runs for. */
export const SCHOOL_YEARS_ON_WEBSITE: ModuleContributions = {
  module: "school_years",
  needs: ["website"],
  contributions: [contribute(siteWords, { word: "year" })],
};
