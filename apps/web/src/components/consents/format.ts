import type { ConsentDecision } from "@faridalms/domain/consents";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";

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
