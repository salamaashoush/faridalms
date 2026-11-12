import type { Capability } from "@faridalms/domain/capabilities";
import type { SwitchedModule } from "@faridalms/domain/modules";
import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";
import type { Sentence } from "~/utils/words";

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

/** A tab a module adds to the settings, at its place among the settings' own. */
export interface SettingsTab {
  value: string;
  label: () => string;
  /** Where it sits among the tabs, low first. */
  place: number;
  /** Who keeps it; whoever keeps the school's settings when none is named. */
  capability?: Capability;
  /** What the tab reads, loaded before it opens. */
  queries(): SlotQuery<unknown>[];
  Tab: ComponentType;
}

export const settingsTabs = slot<SettingsTab>("settings tabs");

/**
 * A module the school's administrators switch on themselves, as it asks to
 * be offered. The switch shows whether the module is on or off, so it is
 * read from every module's fillings.
 */
export interface ModuleSwitch {
  module: SwitchedModule;
  place: number;
  name: () => string;
  hint: Sentence;
}

export const moduleSwitches = slot<ModuleSwitch>("module switches");
