import type { Tone } from "@faridalms/ui/system/status";

import * as m from "~/i18n/messages";

export type ShownState = "draft" | "scheduled" | "published" | "archived";

export const STATE_LABEL: Record<ShownState, () => string> = {
  draft: m.siteStateDraft,
  scheduled: m.siteStateScheduled,
  published: m.siteStatePublished,
  archived: m.siteStateArchived,
};

export const STATE_TONE: Record<ShownState, Tone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
};
