import type { ConsentDecision } from "@faridalms/domain/consents";

import { zonedLocal } from "@faridalms/domain/school";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";

export const DECISION_LABEL: Record<ConsentDecision, () => string> = {
  granted: m.consentGranted,
  refused: m.consentRefused,
  withdrawn: m.consentWithdrawn,
};

export const DECISION_TONE: Record<ConsentDecision, Tone> = {
  granted: "success",
  refused: "warning",
  withdrawn: "warning",
};

/** The day a form went out, on the school's calendar. */
export const publishedDay = (iso: string, timeZone: string) =>
  formatDate(zonedLocal(iso, timeZone).slice(0, 10));
