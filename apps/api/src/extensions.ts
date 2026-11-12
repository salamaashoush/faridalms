import type { ModuleContributions } from "./core/extension";

import { HOMEROOMS } from "./homerooms/contributions";

/**
 * Every module's contributions to the points core and the modules declare.
 * A point yields only those of the modules on at the school.
 */
export const MODULE_EXTENSIONS: readonly ModuleContributions[] = [HOMEROOMS];
