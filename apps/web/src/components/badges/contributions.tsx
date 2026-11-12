import type { ModuleFillings } from "~/utils/extension";

import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

/** The badges' pages: a class's badges, and the camera a child signs in at. */
export const BADGES: ModuleFillings = {
  module: "badges",
  fillings: [fill(modulePages, ["/badges", "/badge"])],
};
