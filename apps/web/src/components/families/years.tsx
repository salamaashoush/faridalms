import type { ModuleFillings } from "~/utils/extension";

import { reenrolmentAnswerers } from "~/components/years/slots";
import { fill } from "~/utils/extension";

/** A year's rollover asks the families whether each child returns. */
export const FAMILIES_IN_YEARS: ModuleFillings = {
  module: "families",
  needs: ["school_years"],
  fillings: [fill(reenrolmentAnswerers, true)],
};
