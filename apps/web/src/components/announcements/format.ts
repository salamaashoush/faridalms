import type { AudienceScope, Urgency } from "@faridalms/domain/announcements";
import type { PublicationPhase } from "@faridalms/domain/publication";
import type { Tone } from "@faridalms/ui/system/status";

import { AUDIENCE_SCOPES } from "@faridalms/domain/announcements";

import { classTitle } from "~/components/classes/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import type { AudienceKind } from "./slots";

import { wholeKind } from "./slots";

export const URGENCY_LABEL: Record<Urgency, () => string> = {
  normal: m.annNormal,
  important: m.annImportant,
  urgent: m.annUrgent,
};

export const URGENCY_TONE: Record<Urgency, Tone> = {
  normal: "neutral",
  important: "warning",
  urgent: "danger",
};

export const STATE_LABEL: Record<PublicationPhase, () => string> = {
  draft: m.annStateDraft,
  scheduled: m.annStateScheduled,
  published: m.annStatePublished,
  archived: m.annStateArchived,
};

export const STATE_TONE: Record<PublicationPhase, Tone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
};

export const SCOPE_LABEL: Record<AudienceScope, () => string> = {
  school: m.annScopeSchool,
  staff: m.annScopeStaff,
  students: m.annScopeStudents,
  class: m.annScopeClass,
};

/** Whether a scope is one of the school's own, rather than one a module adds. */
export const isCoreScope = (scope: string): scope is AudienceScope =>
  (AUDIENCE_SCOPES as readonly string[]).includes(scope);

export function audienceLabel(
  audience: {
    scope: string;
    classCode: string | null;
    classTitleEn: string | null;
    classTitleAr: string | null;
    labelEn: string | null;
    labelAr: string | null;
  },
  kinds: readonly AudienceKind[],
): string {
  if (audience.scope === "class")
    return classTitle({
      code: audience.classCode ?? "",
      titleEn: audience.classTitleEn,
      titleAr: audience.classTitleAr,
    });
  if (isCoreScope(audience.scope)) return SCOPE_LABEL[audience.scope]();
  return (
    wholeKind(kinds, audience.scope)?.label() ??
    inLocale(audience.labelEn, audience.labelAr)
  );
}
