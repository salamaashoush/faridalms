import type { LessonCompletion, ModuleState } from "@faridalms/domain/learning";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";

export const STATE_LABEL: Record<ModuleState | "scheduled", () => string> = {
  draft: m.lrnStateDraft,
  scheduled: m.lrnStateScheduled,
  published: m.lrnStateOpen,
  archived: m.lrnStateArchived,
};

export const STATE_TONE: Record<ModuleState | "scheduled", Tone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
};

/** A published module whose time has not come shows as scheduled. */
export function shownState(
  row: { state: ModuleState; publishAt: string | null },
  now = Date.now(),
): ModuleState | "scheduled" {
  return row.state === "published" &&
    row.publishAt &&
    Date.parse(row.publishAt) > now
    ? "scheduled"
    : row.state;
}

export const COMPLETION_LABEL: Record<LessonCompletion, () => string> = {
  view: m.lrnDoneView,
  mark: m.lrnDoneMark,
  quiz: m.lrnDoneQuiz,
  score: m.lrnDoneScore,
  reflection: m.lrnDoneReflection,
};

export const LESSON_STATE_LABEL = {
  done: m.lrnLessonDone,
  open: m.lrnLessonOpen,
  locked: m.lrnLessonLocked,
} as const;
