import type { AudienceScope, Urgency } from "@faridalms/domain/announcements";
import type { PublicationPhase } from "@faridalms/domain/publication";
import type { Tone } from "@faridalms/ui/system/status";

import { classTitle } from "~/components/classes/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

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
  families: m.annScopeFamilies,
  students: m.annScopeStudents,
  class: m.annScopeClass,
  grade: m.annScopeGrade,
};

export function audienceLabel(audience: {
  scope: AudienceScope;
  classCode: string | null;
  classTitleEn: string | null;
  classTitleAr: string | null;
  gradeLabelEn: string | null;
  gradeLabelAr: string | null;
}): string {
  if (audience.scope === "class")
    return classTitle({
      code: audience.classCode ?? "",
      titleEn: audience.classTitleEn,
      titleAr: audience.classTitleAr,
    });
  if (audience.scope === "grade")
    return inLocale(audience.gradeLabelEn, audience.gradeLabelAr);
  return SCOPE_LABEL[audience.scope]();
}
