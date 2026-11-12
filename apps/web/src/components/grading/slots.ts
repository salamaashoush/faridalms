import type { ComponentType } from "react";

import { slot } from "~/utils/extension";

/**
 * An action beside the school's grade scales that a module adds, with the
 * sheet it opens: grading a term again on new bands, say.
 */
export interface GradingScaleAction {
  key: string;
  Action: ComponentType;
}

export const gradingScaleActions = slot<GradingScaleAction>(
  "grading scale actions",
);
