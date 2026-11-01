import type {
  LessonCompletion,
  LessonCondition,
} from "@faridalms/domain/learning";
import type {
  Publishable,
  PublicationPhase,
} from "@faridalms/domain/publication";

import { phaseOf } from "@faridalms/domain/publication";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export const STATE_LABEL: Record<PublicationPhase, () => string> = {
  draft: m.lrnStateDraft,
  scheduled: m.lrnStateScheduled,
  published: m.lrnStateOpen,
  archived: m.lrnStateArchived,
};

/** Where a module stands now, by the one publication phase. */
export const shownState = (
  row: Publishable,
  now = Date.now(),
): PublicationPhase => phaseOf(row, new Date(now));

export const STATE_TONE: Record<PublicationPhase, Tone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
};

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
