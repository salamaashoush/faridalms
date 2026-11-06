import type {
  CloseReason,
  EnquiryPurpose,
  EnquirySource,
  EnquiryEvent,
  EnquiryState,
} from "@faridalms/domain/enquiries";
import type { Tone } from "@faridalms/ui/system/status";

import * as m from "~/i18n/messages";

export const STATE_LABEL: Record<EnquiryState, () => string> = {
  open: m.admStateOpen,
  in_progress: m.admStateInProgress,
  converted: m.admStateConverted,
  closed: m.admStateClosed,
};

export const STATE_TONE: Record<EnquiryState, Tone> = {
  open: "warning",
  in_progress: "info",
  converted: "success",
  closed: "neutral",
};

export const SOURCE_LABEL: Record<EnquirySource, () => string> = {
  website: m.admSourceWebsite,
  phone: m.admSourcePhone,
  email: m.admSourceEmail,
  walk_in: m.admSourceWalkIn,
  event: m.admSourceEvent,
  referral: m.admSourceReferral,
  other: m.admSourceOther,
};

export const PURPOSE_LABEL: Record<EnquiryPurpose, () => string> = {
  enquiry: m.admPurposeEnquiry,
  visit: m.admPurposeVisit,
  general: m.admPurposeGeneral,
};

export const REASON_LABEL: Record<CloseReason, () => string> = {
  answered: m.admReasonAnswered,
  not_interested: m.admReasonNotInterested,
  another_school: m.admReasonAnotherSchool,
  not_eligible: m.admReasonNotEligible,
  no_places: m.admReasonNoPlaces,
  no_response: m.admReasonNoResponse,
  duplicate: m.admReasonDuplicate,
  spam: m.admReasonSpam,
  other: m.admReasonOther,
};

const isState = (value: unknown): value is EnquiryState =>
  typeof value === "string" && value in STATE_LABEL;

/** What a change the enquiry's work recorded in its conversation says, in the reader's language. */
export function enquiryEventText(
  details: Record<string, unknown>,
  nameOf: (en: string | null, ar: string | null) => string,
): string | null {
  const event = details as Partial<EnquiryEvent> & Record<string, unknown>;
  if (event.event === "assigned") {
    const name = nameOf(
      typeof details.nameEn === "string" ? details.nameEn : null,
      typeof details.nameAr === "string" ? details.nameAr : null,
    );
    return name ? m.admEntryAssignedTo({ name }) : m.admEntryUnassigned();
  }
  if (event.event === "state" && isState(details.to)) {
    const reason =
      typeof details.reason === "string" && details.reason in REASON_LABEL
        ? REASON_LABEL[details.reason as CloseReason]()
        : "";
    const moved = details.automatic
      ? details.to === "converted"
        ? m.admEntryApplied()
        : m.admEntryStarted()
      : m.admEntryMoved({ state: STATE_LABEL[details.to]() });
    return reason ? `${moved}: ${reason}` : moved;
  }
  return null;
}
