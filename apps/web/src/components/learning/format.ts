import type {
  LessonCompletion,
  LessonCondition,
  ModuleState,
} from "@faridalms/domain/learning";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

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
  watch: m.lrnDoneWatch,
};

export const LESSON_STATE_LABEL = {
  done: m.lrnLessonDone,
  open: m.lrnLessonOpen,
  locked: m.lrnLessonLocked,
} as const;

/** Who a lesson shown by score is for, naming the lesson the score is from. */
export function conditionText(condition: LessonCondition, title: string) {
  const atLeast = formatNumber(condition.atLeast ?? 0);
  const below = formatNumber(condition.below ?? 0);
  if (condition.atLeast === null)
    return m.lrnConditionBelowText({ below, title });
  if (condition.below === null)
    return m.lrnConditionAtLeastText({ atLeast, title });
  return m.lrnConditionBetweenText({ atLeast, below, title });
}

/** Why a student's module still waits on its prerequisite. */
export function lockedText(row: {
  prerequisiteTitle: string | null;
  prerequisiteScore: number | null;
  prerequisiteResult: { finished: boolean; score: number | null } | null;
}) {
  const title = row.prerequisiteTitle ?? "";
  if (row.prerequisiteScore === null) return m.lrnLockedAfter({ title });
  const now = row.prerequisiteResult?.score;
  return row.prerequisiteResult?.finished && now !== null && now !== undefined
    ? m.lrnLockedScoreNow({
        title,
        score: formatNumber(row.prerequisiteScore),
        now: formatNumber(now),
      })
    : m.lrnLockedScore({ title, score: formatNumber(row.prerequisiteScore) });
}
