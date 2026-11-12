import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

/** A section a module adds to the school's own settings, with what it reads. */
export interface SchoolSettingsSection {
  key: string;
  query(): SlotQuery<unknown>;
  Section: ComponentType;
}

export const schoolSettingsSections = slot<SchoolSettingsSection>(
  "school settings sections",
);
