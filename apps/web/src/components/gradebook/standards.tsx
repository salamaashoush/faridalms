import type { ModuleFillings } from "~/utils/extension";

import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

/** A student's grades page shows their skills where standards are kept. */
export const GRADEBOOK_WITH_STANDARDS: ModuleFillings = {
  module: "gradebook",
  needs: ["standards"],
  fillings: [fill(modulePages, ["/me/grades", "/family/grades"])],
};
