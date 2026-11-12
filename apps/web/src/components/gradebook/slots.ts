import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export interface GradesSectionProps {
  /** The learner whose grades these are; empty for the viewer's own. */
  studentId: string;
}

/** A section of a learner's grades page, for them and those who follow them. */
export interface GradesSection {
  key: string;
  place: number;
  /** Written for those who follow the learner, never shown to the learner. */
  followersOnly?: boolean;
  query(studentId: string): SlotQuery<unknown>;
  Section: ComponentType<GradesSectionProps>;
}

export const gradesSections = slot<GradesSection>("grades sections");
