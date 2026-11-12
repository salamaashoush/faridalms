import type { ModuleContributions } from "./core/extension";

import { HOMEROOMS } from "./homerooms/contributions";
import { HOMEROOMS_IN_YEARS } from "./homerooms/years";
import { SCHOOL_YEARS } from "./years/contributions";

/**
 * Every module's contributions to the points core and the modules declare.
 * A point yields only those of the modules on at the school.
 */
export const MODULE_EXTENSIONS: readonly ModuleContributions[] = [
  HOMEROOMS,
  HOMEROOMS_IN_YEARS,
  SCHOOL_YEARS,
];
