import type { ModuleFillings } from "./utils/extension";

import { HOMEROOMS } from "./components/homerooms/contributions";

/**
 * Every module's fillings for the slots pages declare. A slot shows only
 * those of the modules on at the school.
 */
export const MODULE_FILLINGS: readonly ModuleFillings[] = [HOMEROOMS];
