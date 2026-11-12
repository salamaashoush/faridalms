import type { ModuleScope } from "../core/extension";

import { point } from "../core/extension";

/**
 * When a module ends the badges printed now, however recently they were
 * used: the end of the school year, say. Null where it ends none.
 */
export interface BadgeEnds {
  endOf(
    scope: ModuleScope,
    input: { today: string; otherwise: Date },
  ): Promise<Date | null>;
}

export const badgeEnds = point<BadgeEnds>("badge ends");
