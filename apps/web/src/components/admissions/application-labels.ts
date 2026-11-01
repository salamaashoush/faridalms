import type {
  AgeFit,
  ApplicationState,
  ChecklistKind,
  Decision,
  EventKind,
  EventOutcome,
  FeeKind,
  FunnelStage,
  IntakeWindow,
  ItemState,
  LetterKind,
  NeedsKind,
  PriorityRule,
  WithdrawReason,
} from "@faridalms/domain/admissions";
import type { EnquirySource, QuestionKind } from "@faridalms/domain/enquiries";

import type { Tone } from "~/components/system/status";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

/** Words a school wrote in one language or both; an empty one borrows the other. */
export const named = (en: string | null, ar: string | null) =>
  inLocale(en || null, ar || null);

export const APPLICATION_STATE_LABEL: Record<ApplicationState, () => string> = {
  draft: m.aplStateDraft,
  submitted: m.aplStateSubmitted,
  in_review: m.aplStateInReview,
  decided: m.aplStateDecided,
  offered: m.aplStateOffered,
  accepted: m.aplStateAccepted,
  enrolled: m.aplStateEnrolled,
  waitlisted: m.aplStateWaitlisted,
  declined_by_school: m.aplStateDeclined,
  withdrawn: m.aplStateWithdrawn,
  offer_declined: m.aplStateOfferDeclined,
  offer_expired: m.aplStateOfferExpired,
  deferred: m.aplStateDeferred,
};

export const APPLICATION_STATE_TONE: Record<ApplicationState, Tone> = {
  draft: "neutral",
  submitted: "success",
  in_review: "info",
  decided: "info",
  offered: "info",
  accepted: "success",
  enrolled: "success",
  waitlisted: "warning",
  declined_by_school: "neutral",
  withdrawn: "neutral",
  offer_declined: "neutral",
  offer_expired: "neutral",
  deferred: "neutral",
};

export const ITEM_STATE_LABEL: Record<ItemState, () => string> = {
  pending: m.aplItemPending,
  received: m.aplItemReceived,
  verified: m.aplItemVerified,
  waived: m.aplItemWaived,
  rejected: m.aplItemRejected,
};

export const ITEM_STATE_TONE: Record<ItemState, Tone> = {
  pending: "warning",
  received: "info",
  verified: "success",
  waived: "neutral",
  rejected: "danger",
};

/** The office's action that moves a checklist step to each state. */
export const ITEM_MOVE_LABEL: Record<ItemState, () => string> = {
  pending: m.aplItemMovePending,
  received: m.aplItemMoveReceived,
  verified: m.aplItemMoveVerified,
  waived: m.aplItemMoveWaived,
  rejected: m.aplItemMoveRejected,
};

export const CHECKLIST_KIND_LABEL: Record<ChecklistKind, () => string> = {
  document: m.itkKindDocument,
  assessment: m.itkKindAssessment,
  interview: m.itkKindInterview,
  fee: m.itkKindFee,
  reference: m.itkKindReference,
};

export const FEE_KIND_LABEL: Record<FeeKind, () => string> = {
  application: m.itkFeeApplication,
  assessment: m.itkFeeAssessment,
  registration: m.itkFeeRegistration,
  tuition: m.itkFeeTuition,
  other: m.itkFeeOther,
};

export const PRIORITY_LABEL: Record<PriorityRule, () => string> = {
  sibling: m.itkPrioritySibling,
  staff_child: m.itkPriorityStaffChild,
  returning_student: m.itkPriorityReturning,
  additional_needs: m.itkPriorityNeeds,
};

export const WINDOW_LABEL: Record<IntakeWindow, () => string> = {
  upcoming: m.itkWindowUpcoming,
  open: m.itkWindowOpen,
  closed: m.itkWindowClosed,
};

export const WINDOW_TONE: Record<IntakeWindow, Tone> = {
  upcoming: "info",
  open: "success",
  closed: "neutral",
};

export const WITHDRAW_LABEL: Record<WithdrawReason, () => string> = {
  family_request: m.aplWithdrawFamily,
  another_school: m.aplWithdrawAnotherSchool,
  moving: m.aplWithdrawMoving,
  duplicate: m.aplWithdrawDuplicate,
  no_response: m.aplWithdrawNoResponse,
  other: m.aplWithdrawOther,
};

export const NEEDS_LABEL: Record<NeedsKind, () => string> = {
  chronic_condition: m.aplNeedsConditions,
  allergy: m.aplNeedsAllergies,
  medication: m.aplNeedsMedication,
  dietary_requirement: m.aplNeedsDiet,
  additional_needs: m.aplNeedsLearning,
};

export const NEEDS_HINT: Record<NeedsKind, () => string> = {
  chronic_condition: m.aplNeedsConditionsHint,
  allergy: m.aplNeedsAllergiesHint,
  medication: m.aplNeedsMedicationHint,
  dietary_requirement: m.aplNeedsDietHint,
  additional_needs: m.aplNeedsLearningHint,
};

export const AGE_LABEL: Record<AgeFit, () => string> = {
  fits: m.aplAgeFits,
  young: m.aplAgeYoung,
  old: m.aplAgeOld,
  unknown: m.aplAgeUnknown,
};

/** The kinds of answer a school's question takes, worded as the website builder words them. */
export const ANSWER_LABEL: Record<QuestionKind, () => string> = {
  short: m.siteChoiceAnswerShort,
  long: m.siteChoiceAnswerLong,
  choice: m.siteChoiceAnswerChoice,
  date: m.siteChoiceAnswerDate,
  number: m.siteChoiceAnswerNumber,
};

export const DECISION_LABEL: Record<Decision, () => string> = {
  offer: m.decDecisionOffer,
  waitlist: m.decDecisionWaitlist,
  decline: m.decDecisionDecline,
};

export const DECISION_HINT: Record<Decision, () => string> = {
  offer: m.decDecisionOfferHint,
  waitlist: m.decDecisionWaitlistHint,
  decline: m.decDecisionDeclineHint,
};

export const LETTER_LABEL: Record<LetterKind, () => string> = {
  offer: m.decLetterOffer,
  waitlist: m.decLetterWaitlist,
  decline: m.decLetterDecline,
  welcome: m.decLetterWelcome,
};

export const EVENT_KIND_LABEL: Record<EventKind, () => string> = {
  tour: m.decEventTour,
  assessment: m.decEventAssessment,
  interview: m.decEventInterview,
};

export const EVENT_OUTCOME_LABEL: Record<EventOutcome, () => string> = {
  scheduled: m.decOutcomeScheduled,
  attended: m.decOutcomeAttended,
  missed: m.decOutcomeMissed,
  cancelled: m.decOutcomeCancelled,
};

export const EVENT_OUTCOME_TONE: Record<EventOutcome, Tone> = {
  scheduled: "info",
  attended: "success",
  missed: "warning",
  cancelled: "neutral",
};

/** Where a family came from: an enquiry by one of its channels, or straight to the application. */
export const ORIGIN_LABEL: Record<EnquirySource | "direct", () => string> = {
  website: m.decOriginWebsite,
  phone: m.decOriginPhone,
  email: m.decOriginEmail,
  walk_in: m.decOriginWalkIn,
  event: m.decOriginEvent,
  referral: m.decOriginReferral,
  other: m.decOriginOther,
  direct: m.decOriginDirect,
};

export const STAGE_LABEL: Record<FunnelStage, () => string> = {
  submitted: m.aplStateSubmitted,
  in_review: m.aplStateInReview,
  decided: m.aplStateDecided,
  offered: m.aplStateOffered,
  accepted: m.aplStateAccepted,
  enrolled: m.aplStateEnrolled,
};
