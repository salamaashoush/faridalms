import type {
  CloseReason,
  EnquiryPurpose,
  EnquirySource,
  EnquiryState,
  EntryKind,
  ReplyTemplate,
} from "@faridalms/domain/enquiries";

import type { Tone } from "~/components/system/status";

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

export const ENTRY_LABEL: Record<EntryKind, () => string> = {
  note: m.admEntryNote,
  call: m.admEntryCall,
  email: m.admEntryEmail,
  meeting: m.admEntryMeeting,
  reply: m.admEntryReply,
  state: m.admEntryState,
  assigned: m.admEntryAssigned,
};

export const TEMPLATE_LABEL: Record<ReplyTemplate, () => string> = {
  thanks: m.admTemplateThanks,
  visit: m.admTemplateVisit,
  information: m.admTemplateInformation,
  places: m.admTemplatePlaces,
  general: m.admTemplateGeneral,
};
