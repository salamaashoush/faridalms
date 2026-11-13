import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

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

/** A section a module adds to the school's grading settings, after its programmes. */
export interface GradingSettingsSection {
  key: string;
  Section: ComponentType;
}

export const gradingSettingsSections = slot<GradingSettingsSection>(
  "grading settings sections",
);

export interface ProgrammePartFieldProps {
  read: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
}

/**
 * What a module keeps about a programme, edited on its sheet under the
 * module's key and summed up in the list: the grade levels it covers, say.
 * Methods, so each module types what it reads.
 */
export interface ProgrammePart {
  key: string;
  query(): SlotQuery<unknown>;
  initial(): unknown;
  summary(read: unknown, value: unknown): string | null;
  Field: ComponentType<ProgrammePartFieldProps>;
}

export const programmeParts = slot<ProgrammePart>("programme parts");

/** How a class's programme is named where a module gives a class without one its programme. */
export interface ProgrammeDefaultWords {
  /** The choice of following the programme the module gives. */
  option: () => string;
  /** Beside a programme the module gave. */
  derived: () => string;
  /** Beside the class's choice of programme. */
  hint: () => string;
}

export const programmeDefaultWords = slot<ProgrammeDefaultWords>(
  "programme default words",
);
