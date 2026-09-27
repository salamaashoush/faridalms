import type {
  AssignmentPhase,
  LearnerState,
} from "@faridalms/domain/coursework";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";

export const STATE_LABEL: Record<LearnerState, () => string> = {
  not_available: m.courseworkStateNotAvailable,
  to_do: m.courseworkStateToDo,
  in_progress: m.courseworkStateInProgress,
  handed_in: m.courseworkStateHandedIn,
  handed_in_late: m.courseworkStateHandedInLate,
  missing: m.courseworkStateMissing,
  needs_revision: m.courseworkStateNeedsRevision,
  returned: m.courseworkStateReturned,
  excused: m.courseworkStateExcused,
};

export const STATE_TONE: Record<LearnerState, Tone> = {
  not_available: "neutral",
  to_do: "info",
  in_progress: "info",
  handed_in: "success",
  handed_in_late: "warning",
  missing: "danger",
  needs_revision: "warning",
  returned: "accent",
  excused: "neutral",
};

export const PHASE_LABEL: Record<AssignmentPhase, () => string> = {
  draft: m.courseworkPhaseDraft,
  scheduled: m.courseworkPhaseScheduled,
  assigned: m.courseworkPhaseAssigned,
  past_due: m.courseworkPhasePastDue,
  closed: m.courseworkPhaseClosed,
  archived: m.courseworkPhaseArchived,
};

export const PHASE_TONE: Record<AssignmentPhase, Tone> = {
  draft: "neutral",
  scheduled: "info",
  assigned: "success",
  past_due: "warning",
  closed: "neutral",
  archived: "neutral",
};

/** An instant on the school's clock, the way due times are read. */
export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function formatScore(score: number | null, points: number | null) {
  if (score === null) return "";
  return points === null
    ? formatNumber(score)
    : m.courseworkScoreOf({
        score: formatNumber(score),
        points: formatNumber(points),
      });
}
