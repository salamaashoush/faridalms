import type { Tone } from "@faridalms/ui/system/status";
import type { LinkProps } from "@tanstack/react-router";

import { slot } from "~/utils/extension";

export type RegisterState = "not_started" | "in_progress" | "submitted";

/**
 * What a module that keeps registers adds to a teacher's lessons: where
 * the day's lessons card opens, each lesson's link to its register, and
 * the words of a register's state.
 */
export interface LessonRegisters {
  action: { label: () => string; link: LinkProps };
  linkOf(lesson: {
    classId: string;
    periodId: string;
    date: string;
  }): LinkProps;
  /** What a lesson's link to its register is called, by the lesson's code. */
  openLabel: (lesson: string) => string;
  states: Readonly<Record<RegisterState, { label: () => string; tone: Tone }>>;
}

export const lessonRegisters = slot<LessonRegisters>("lesson registers");
