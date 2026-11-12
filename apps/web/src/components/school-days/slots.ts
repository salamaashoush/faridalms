import type { ComponentType, ReactNode } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

/** A day of the school's days as the planner draws it. */
export interface PlannerDay {
  day: string;
  /** What the school marked it as, else a school day or a weekend by its week. */
  meaning: string;
  marked: boolean;
  open: boolean;
  noteEn: string | null;
  noteAr: string | null;
  provisional: boolean;
}

/** What a module adds to one day of the planner. */
export interface PlannerDayPart {
  /** Words added to the day's label. */
  words: string[];
  /** Marks drawn on the day. */
  marks?: ReactNode;
  /** The day stands outside what the module keeps, as a day between terms. */
  outside?: boolean;
}

export interface PlannerAsideProps {
  read: unknown;
  /** The days shown, first to last. */
  from: string;
  to: string;
  days: readonly PlannerDay[];
  /** The run of days chosen, if any. */
  range: { from: string; to: string } | null;
  canEdit: boolean;
  /** Clears the chosen days once a change is made. */
  onDone: () => void;
}

/**
 * A module's part of the school-days planner: what it reads for the days
 * shown, what it adds to each day and to the legend, and the panels it
 * shows beside the months. Methods, so each module types what it reads.
 */
export interface DayPlannerPart {
  key: string;
  query(from: string, to: string): SlotQuery<unknown>;
  dayOf?(read: unknown, day: PlannerDay): PlannerDayPart | null;
  legend?(read: unknown): { key: string; swatch: ReactNode; label: string }[];
  Aside?: ComponentType<PlannerAsideProps>;
}

export const dayPlannerParts = slot<DayPlannerPart>("day planner parts");
