import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";
import { validationMessage } from "~/utils/validation";

/** Followed by the last day a register marks the student, which the change would undo. */
const REGISTERS_AFTER = "enrollment.registers_after:";
/** Followed by the first day a register was taken in a period the change rewrites. */
export const PERIOD_REGISTERS_AFTER = "class_period.registers_after:";
/** Followed by the first day cover is arranged in a period the change ends. */
export const PERIOD_COVER_AFTER = "class_period.cover_after:";

const CODE = /^[a-z][a-z0-9_]*\.[a-z0-9_.]+(?::.*)?$/;

/**
 * What reaches the page without a code and no person should read as
 * written: oRPC's own English for a refusal, and each browser's words for
 * a request that never arrived. Any other uncoded message is copy written
 * for a person and passes through untouched.
 */
const UNCODED: Partial<Record<string, () => string>> = {
  "Bad Request": m.errorInvalidGeneric,
  "Input validation failed": m.errorInvalidGeneric,
  Unauthorized: m.errorSignedOut,
  Forbidden: m.errorForbidden,
  "Not Found": m.errorNotFoundRecord,
  "Payload Too Large": m.errorTooLarge,
  "Too Many Requests": m.errorTooManyAttempts,
  "Method Not Supported": m.notificationErrorMessage,
  "Not Acceptable": m.notificationErrorMessage,
  "Request Timeout": m.notificationErrorMessage,
  Conflict: m.notificationErrorMessage,
  "Precondition Failed": m.notificationErrorMessage,
  "Unsupported Media Type": m.notificationErrorMessage,
  "Unprocessable Content": m.notificationErrorMessage,
  "Client Closed Request": m.notificationErrorMessage,
  "Internal Server Error": m.notificationErrorMessage,
  "Output validation failed": m.notificationErrorMessage,
  "Not Implemented": m.notificationErrorMessage,
  "Bad Gateway": m.notificationErrorMessage,
  "Service Unavailable": m.notificationErrorMessage,
  "Gateway Timeout": m.notificationErrorMessage,
  // What Chromium, WebKit and Firefox say when a request never arrived.
  "Failed to fetch": m.errorNetwork,
  "Load failed": m.errorNetwork,
  "NetworkError when attempting to fetch resource.": m.errorNetwork,
};

/** True for a code the API refused with, false for copy written for a person. */
export const isErrorCode = (message: string) => CODE.test(message);

/**
 * Codes the API can answer with that no person can act on, read as the
 * generic error rather than given copy of their own.
 */
const INTERNAL_CODES: ReadonlySet<string> = new Set([
  "academic_session.parent_invalid",
  "academic_week.number_taken",
  "academic_week.overlapping",
  "access_arrangements.exists",
  "access_role.other_org",
  "account.handle_taken",
  "account.no_password",
  "administrator.not_found",
  "announcements.ack_due_without_ack",
  "application.questions",
  "assessment.exists",
  "attendance.check_in_who",
  "attendance.duplicate_student",
  "attendance.minutes_not_timed",
  "auth.invalid_handoff",
  "auth.invalid_invite",
  "broadcast_recipient.exists",
  "calendar.code_taken",
  "calendar.range",
  "calendar.school_calendar_exists",
  "calendar_date.exists",
  "calendar_grade_level.exists",
  "caption_draft.exists",
  "cell.not_open",
  "class.subject_invalid",
  "class_period.code_overlapping",
  "class_period.sequence_overlapping",
  "contact_point.email_invalid",
  "contact_point.unverified",
  "course.code_taken",
  "coursework.comment_answered",
  "descriptor.relation_token_invalid",
  "document.frozen",
  "document_translation.exists",
  "document_version.exists",
  "documents.frozen",
  "exam.sits_in_month",
  "external_id.must_be_sealed",
  "external_id.suffix_forbidden",
  "family_share.exists",
  "file.empty",
  "file.health_report_invalid",
  "file.trim",
  "file.trim_unavailable",
  "file_publication.key_taken",
  "form.questions",
  "grading.bands_needed",
  "grading.one_board",
  "health_change.exists",
  "hosts.lookup_failed",
  "hosts.route_missing",
  "hosts.tls_pending",
  "hosts.txt_missing",
  "identifiers.system",
  "identity_provider.exists",
  "identity_provider_org.exists",
  "intake.fees",
  "intake.priorities",
  "learning.band_twice",
  "learning.checks_repeated",
  "learning.released",
  "learning.tiles_needed",
  "learning.trace_needed",
  "learning.watch_range",
  "lesson_code.exists",
  "lesson_progress.exists",
  "lesson_projects.exists",
  "lesson_shares.exists",
  "lesson_watches.exists",
  "location.code_taken",
  "login_identity.badge_taken",
  "login_identity.handoff_taken",
  "login_identity.invite_taken",
  "login_identity.subject_taken",
  "lti.line_item_exists",
  "lti.score_exists",
  "lti.score_maximum",
  "media.not_drafting",
  "media.not_encoding",
  "media.not_vtt",
  "messages.taken",
  "org.root_exists",
  "passkey.exists",
  "period_grade.exists",
  "privacy.breach_people_both",
  "privacy.breach_regulator_both",
  "product.too_many",
  "product.unavailable",
  "quiz_answer.exists",
  "quiz_draw.exists",
  "quiz_sitting.exists",
  "relationship.relation_invalid",
  "role.org_invalid",
  "rubric.duplicate_ids",
  "school.slug_taken",
  "school_year.current_exists",
  "session.exists",
  "site.colour",
  "site.duplicate_section",
  "site_post_recipient.exists",
  "submission.exists",
  "templates.exists",
  "tenant.directory_differs",
  "tenant.not_active",
  "tenant.not_in_directory",
  "tenant_key.active_exists",
  "thread_member.exists",
  "timetable.change_shape",
  "validation.revision",
]);

export class HttpError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

interface HasMessage {
  message: string;
}

function hasMessage(value: unknown): value is HasMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as HasMessage).message === "string"
  );
}

export function getMessageFromError(error: unknown): string {
  if (error instanceof HttpError) {
    return hasMessage(error.data) ? error.data.message : error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (hasMessage(error)) {
    switch (error.message) {
      case "conflict.version":
        return m.errorConflictVersion();
      case "contact_point.phone_invalid":
        return m.errorPhoneInvalid();
      case "contact_point.exists":
        return m.errorConflictVersion();
      case "access.last_manager":
        return m.errorAccessLastManager();
      case "access.not_held":
        return m.errorAccessNotHeld();
      case "access.self_lockout":
        return m.accessSelfLockout();
      case "account.self":
        return m.errorAccountSelf();
      case "school.week_start_weekend":
        return m.errorWeekStartWeekend();
      case "class.code_taken":
        return m.errorClassCodeTaken();
      case "standards.move":
        return m.errorStandardsMove();
      case "standards.case_title":
        return m.errorStandardsCaseTitle();
      case "standards.framework_exists":
        return m.errorStandardsFrameworkExists();
      case "standards.exists":
        return m.errorStandardsExists();
      case "standards.evidence_exists":
        return m.errorStandardsEvidence();
      case "standards.judgement_exists":
        return m.errorStandardsJudgement();
      case "learning.audience":
        return m.errorLearningAudience();
      case "learning.targets_needed":
        return m.lrnErrTargetsNeeded();
      case "templates.reviewed":
        return m.errorLibraryReviewed();
      case "templates.not_owner":
        return m.errorLibraryNotOwner();
      case "school_year.closed":
        return m.errorSchoolYearClosed();
      case "school_year.overlapping":
        return m.errorYearOverlapping();
      case "school_year.end_year_fixed":
      case "school_year.end_mismatch":
        return m.errorYearEndFixed();
      case "school_year.rows_outside_dates":
        return m.errorYearRowsOutside();
      case "school_year.current_closing":
        return m.errorYearCurrentClosing();
      case "school_year.transition":
        return m.errorYearTransition();
      case "school_year.reason_required":
        return m.yearsReasonRequired();
      case "school_year.missing":
        return m.errorSchoolYearMissing();
      case "academic_session.overlapping":
        return m.errorTermsOverlapping();
      case "coursework.quiz_needed":
      case "coursework.quiz_questions":
        return m.quizQuestionsNeeded();
      case "coursework.quiz_incomplete":
        return m.courseworkErrQuizIncomplete();
      case "coursework.quiz_gate":
        return m.errQuizGate();
      case "coursework.draw_tag":
        return m.errDrawTag();
      case "coursework.draw_short":
        return m.errDrawShort();
      case "coursework.time_up":
        return m.errTimeUp();
      case "coursework.on_break":
        return m.errOnBreak();
      case "coursework.no_break":
        return m.errNoBreak();
      case "coursework.quiz_rubric":
        return m.errQuizRubric();
      case "coursework.quiz_started":
        return m.quizStartedHint();
      case "coursework.format_fixed":
        return m.errFormatFixed();
      case "coursework.not_quiz":
        return m.errNotQuiz();
      case "coursework.not_practice":
        return m.errNotPractice();
      case "coursework.post_empty":
        return m.errPostEmpty();
      case "coursework.post_first":
        return m.errPostFirst();
      case "coursework.post_hidden":
        return m.errPostHidden();
      case "coursework.discussion_needed":
        return m.errDiscussionNeeded();
      case "coursework.peer_format":
        return m.errPeerFormat();
      case "coursework.peer_started":
        return m.errPeerStarted();
      case "coursework.peer_off":
        return m.errPeerOff();
      case "coursework.peer_draft":
        return m.errPeerDraft();
      case "coursework.peer_too_few":
        return m.errPeerTooFew();
      case "coursework.peer_not_started":
        return m.errPeerNotStarted();
      case "coursework.peer_released":
        return m.errPeerReleased();
      case "coursework.peer_rubric":
        return m.errPeerRubric();
      case "coursework.peer_handed_out":
        return m.errPeerHandedOut();
      case "coursework.peer_exists":
        return m.errPeerExists();
      case "coursework.closed":
        return m.errorCourseworkClosed();
      case "coursework.nothing_to_hand_in":
        return m.errorCourseworkNothingToHandIn();
      case "coursework.written_needed":
        return m.errorCourseworkWrittenNeeded();
      case "coursework.files_needed":
        return m.errorCourseworkFilesNeeded();
      case "coursework.cannot_undo":
        return m.errorCourseworkCannotUndo();
      case "coursework.brief_empty":
        return m.errorCourseworkBriefEmpty();
      case "coursework.audience_empty":
        return m.courseworkAudienceRequired();
      case "coursework.not_assigned":
        return m.errorCourseworkNotAssigned();
      case "coursework.not_draft":
        return m.errorCourseworkNotDraft();
      case "coursework.rubric_total":
        return m.errorCourseworkRubricTotal();
      case "coursework.rubric_needs_points":
        return m.courseworkPointsRequired();
      case "coursework.due_before_available":
        return m.validationDueAfterAvailable();
      case "coursework.close_before_due":
        return m.validationCloseAfterDue();
      case "coursework.deduction_required":
        return m.courseworkDeductionRequired();
      case "coursework.too_many_files":
        return m.errorCourseworkTooManyFiles();
      case "coursework.score_range":
      case "gradebook.score_range":
        return m.errorScoreRange();
      case "coursework.comment_author":
        return m.errorCourseworkCommentAuthor();
      case "gradebook.not_in_class":
        return m.errorGradebookNotInClass();
      case "file.not_attachable":
        return m.errorFileNotAttachable();
      case "enrollment.future_placement":
        return m.errorFuturePlacement();
      case "auth.wrong_password":
        return m.errorWrongPassword();
      case "auth.too_many_attempts":
        return m.errorTooManyAttempts();
      case "privacy.follows_only":
        return m.errorFollowsOnly();
      case "privacy.requests_open":
        return m.errorRequestsOpen();
      case "privacy.answered_elsewhere":
        return m.errorAnsweredElsewhere();
      case "health.not_permitted":
        return m.errorHealthNotPermitted();
      case "health.change_unchanged":
        return m.errorHealthUnchanged();
      case "health.change_decided":
        return m.errorHealthDecided();
      case "health.change_stale":
        return m.errorHealthStale();
      case "health.kind":
        return m.errorHealthKind();
      case "sign_in.no_email":
        return m.errorSignInNoEmail();
      case "sign_in.no_address":
        return m.errorSignInNoAddress();
      case "sign_in.not_sent":
        return m.errorSignInNotSent();
      case "leaving.not_enrolled":
        return m.errorLeavingNotEnrolled();
      case "leaving.none":
        return m.errorLeavingNone();
      case "enrollment.outside_year":
      case "enrollment.outside_dates":
        return m.errorEnrollmentOutsideYear();
      case "enrollment.overlapping":
        return m.errorAlreadyEnrolled();
      case "enrollment.homeroom_overlapping":
        return m.errorConflictVersion();
      case "content.invalid":
        return m.contentInvalid();
      case "bank.prompt_needed":
        return m.bankErrPrompt();
      case "bank.not_owner":
        return m.bankErrOwner();
      case "bank.one_question":
        return m.bankErrOne();
      case "content.alt":
        return m.siteIssueAlt();
      case "content.order":
        return m.siteIssueOrder();
      case "content.link":
        return m.siteIssueLink();
      case "content.heading":
        return m.siteIssueHeading();
      case "content.captions":
        return m.contentIssueCaptions();
      case "content.unreviewed":
        return m.contentIssueUnreviewed();
      case "content.consent":
      case "announcements.consent":
        return m.contentErrConsent();
      case "announcements.archived":
        return m.annErrArchived();
      case "announcements.already_out":
        return m.annErrAlreadyOut();
      case "announcements.title":
        return m.annTitleNeeded();
      case "announcements.nothing_to_check":
        return m.translationErrNothingToCheck();
      case "announcements.nobody":
        return m.annErrNobody();
      case "announcements.no_ack":
        return m.annErrNoAck();
      case "announcements.audience_target":
        return m.annAudienceTarget();
      case "news.archived":
        return m.newsErrArchived();
      case "news.already_out":
        return m.newsErrAlreadyOut();
      case "news.nobody":
        return m.annErrNobody();
      case "news.empty":
        return m.newsBodyNeeded();
      case "news.nothing_to_check":
      case "consents.nothing_to_check":
        return m.translationErrNothingToCheck();
      case "external_id.taken":
        return m.identifiersErrTaken();
      case "identifiers.egypt":
        return m.identifiersErrEgypt();
      case "identifiers.dates":
        return m.identifiersErrDates();
      case "identifiers.number":
        return m.validationRequired();
      case "consents.draft_open":
        return m.consentErrDraftOpen();
      case "consents.published":
        return m.consentErrPublished();
      case "consents.empty":
        return m.consentErrEmpty();
      case "consents.words_only":
        return m.consentErrWordsOnly();
      case "consents.not_guardian":
        return m.consentErrNotGuardian();
      case "consents.superseded":
        return m.consentErrSuperseded();
      case "consents.future":
        return m.consentErrFuture();
      case "consents.scan":
        return m.consentScanNeeded();
      case "news.consent":
        return m.newsErrConsent();
      case "news.title":
        return m.newsTitleNeeded();
      case "news.audience":
        return m.newsErrAudience();
      case "messages.no_guardians":
        return m.msgNoGuardians();
      case "messages.recipient":
        return m.msgRecipientGone();
      case "messages.newer":
        return m.msgNewer();
      case "messages.empty":
        return m.msgBodyNeeded();
      case "messages.recipients":
        return m.messageDraftIncomplete();
      case "message_draft.revision_conflict":
        return m.messageDraftConflict();
      case "privacy.contact_linked":
        return m.msgContactLinked();
      case "attendance.outside_year":
        return m.attendanceOutsideYear();
      case "attendance.future":
        return m.attFutureDay();
      case "attendance.not_roster":
        return m.attNotRoster();
      case "attendance.window":
        return m.attOutsideWindow();
      case "attendance.closed":
        return m.attClosedYear();
      case "attendance.not_school_day":
        return m.attNotSchoolDay();
      case "attendance.no_period":
        return m.attNoPeriod();
      case "attendance.reason":
        return m.attReasonInvalid();
      case "attendance.range":
        return m.attRangeInvalid();
      case "attendance.correction_reason":
        return m.attCorrectionNeeded();
      case "attendance.lateness":
        return m.attRuleClosesAfterLate();
      case "attendance.pickup_who":
        return m.deskChooseCollector();
      case "attendance.pickup_not_allowed":
        return m.deskMustNotCollect();
      case "attendance.report_late":
        return m.repTooLate();
      case "attendance.report_time":
        return m.repNeedsTime();
      case "attendance.report_decided":
        return m.repAlreadyDecided();
      case "attendance.check_in_off":
        return m.attErrCheckInOff();
      case "timetable.busy":
        return m.ttBusyError();
      case "timetable.outside_year":
        return m.ttOutsideYear();
      case "timetable.not_school_day":
        return m.ttNotSchoolDay();
      case "timetable.no_period":
        return m.ttNoPeriod();
      case "class_period.outside_year":
        return m.periodsOutsideYear();
      case "class_period.no_days":
        return m.periodsNoDays();
      case "timetable.not_in_group":
        return m.ttNotInGroup();
      case "timetable.teacher":
      case "timetable.room":
        return m.ttChoiceGone();
      case "timetable.class_busy":
      case "timetable.group_busy":
        return m.ttGroupBusy();
      case "timetable.teacher_busy":
      case "timetable.room_busy":
        return m.ttBusyError();
      case "timetable.cover_busy":
        return m.ttCoverBusy();
      case "timetable.cover_own":
        return m.ttCoverOwn();
      case "timetable.absence_range":
        return m.ttAbsenceRange();
      case "timetable.change_exists":
        return m.errorConflictVersion();
      case "academic_year.closed":
        return m.academicYearClosedError();
      case "reenrolment.no_next_year":
        return m.reenrolNoNextYear();
      case "reenrolment.opened":
        return m.reenrolAlreadyAsked();
      case "reenrolment.closed":
        return m.reenrolClosed();
      case "rollover.duplicate_class":
        return m.rolloverDuplicateClass();
      case "rollover.duplicate_code":
        return m.rolloverDuplicateCode();
      case "rollover.class_name":
        return m.rolloverClassName();
      case "rollover.duplicate_subject":
        return m.rolloverDuplicateSubject();
      case "rollover.duplicate_student":
        return m.rolloverDuplicateStudent();
      case "rollover.target_for_leaver":
        return m.rolloverTargetForLeaver();
      case "rollover.missing_target":
        return m.rolloverMissingTarget();
      case "rollover.source_not_started":
        return m.rolloverSourceNotStarted();
      case "rollover.overlap":
        return m.rolloverOverlap();
      case "rollover.applied":
        return m.rolloverAlreadyApplied();
      case "rollover.not_saved":
        return m.rolloverNotSaved();
      case "rollover.plan_stale":
        return m.rolloverPlanStale();
      case "rollover.exists":
        return m.rolloverExists();
      case "file.too_large":
        return m.fileTooLarge();
      case "file.content_mismatch":
        return m.fileContentMismatch();
      case "file.infected":
        return m.fileInfected();
      case "file.scan_unavailable":
        return m.fileScanUnavailable();
      case "file.size_mismatch":
        return m.fileSizeMismatch();
      case "file.replace_kind":
        return m.fileReplaceKind();
      case "feature.not_in_plan":
        return m.featureNotInPlanError();
      case "exam.series_unknown":
        return m.examErrSeriesUnknown();
      case "exam.board_unknown":
        return m.examErrBoardUnknown();
      case "exam.keep_until_early":
        return m.examErrKeepUntilEarly();
      case "exam.keep_until_needed":
        return m.examKeepUntilNeeded();
      case "exam.title_needed":
        return m.examTitleNeeded();
      case "exam.reason_needed":
        return m.examReasonNeeded();
      case "exam.below_board":
        return m.examErrBelowBoard();
      case "exam.session_exists":
        return m.examErrSessionExists();
      case "exam.session_unknown":
        return m.examErrSeriesUnknown();
      case "coursework.declaration_needed":
        return m.courseworkErrDeclarationNeeded();
      case "coursework.ai_use_missing":
        return m.courseworkErrAiMissing();
      case "coursework.ai_use_incomplete":
        return m.courseworkErrAiIncomplete();
      case "coursework.ai_use_in_work":
        return m.courseworkErrAiInWork();
      case "coursework.declaration_outstanding":
        return m.courseworkErrDeclarationOutstanding();
      case "coursework.final":
        return m.courseworkErrFinal();
      case "coursework.declared_already":
        return m.courseworkErrDeclaredAlready();
      case "coursework.not_for_quiz":
        return m.courseworkErrNotForQuiz();
      case "coursework.reason_needed":
        return m.authenticationReasonNeeded();
      case "grading.scale_in_use":
        return m.courseworkErrScaleInUse();
      case "grading.programme_in_use":
        return m.courseworkErrProgrammeInUse();
      case "grading.label_repeated":
        return m.gradingLabelRepeated();
      case "grading.bound_repeated":
        return m.gradingBoundRepeated();
      case "grading.no_floor":
        return m.gradingNoFloor();
      case "coursework.category_unknown":
        return m.courseworkErrCategoryUnknown();
      case "grading.weights_total":
        return m.gradingCategoryIncomplete();
      case "grading.level_repeated":
        return m.errorConflictVersion();
      case "grading.scale_unknown":
        return m.gradingErrScaleUnknown();
      case "grading.programme_unknown":
        return m.gradingErrProgrammeUnknown();
      case "grading.title_needed":
        return m.examTitleNeeded();
      case "privacy.person_unknown":
        return m.privacyErrPersonUnknown();
      case "privacy.hold_unknown":
        return m.privacyErrHoldUnknown();
      case "privacy.age_too_young":
        return m.privacyAgeInvalid();
      case "privacy.student_rule_incomplete":
        return m.privacyYearsInvalid();
      case "privacy.request_closed":
        return m.privacyErrRequestClosed();
      case "privacy.no_extension":
        return m.privacyErrNoExtension();
      case "privacy.clock_before_receipt":
        return m.privacyClockBeforeReceipt();
      case "privacy.due_needed":
        return m.privacyDueNeeded();
      case "privacy.breach_closed":
        return m.privacyErrBreachClosed();
      case "privacy.breach_notices_open":
        return m.privacyErrBreachNoticesOpen();
      case "privacy.erasure_held":
        return m.privacyErrErasureHeld();
      case "privacy.erasure_requested":
        return m.privacyErrErasureRequested();
      case "privacy.erasure_exam":
        return m.privacyErrErasureExam();
      case "privacy.not_a_leaver":
        return m.privacyErrNotLeaver();
      case "privacy.not_yet_due":
        return m.privacyErrNotYetDue();
      case "privacy.erasure_request_needed":
        return m.privacyErrErasureRequestNeeded();
      case "privacy.erasure_reference_needed":
        return m.privacyOrderReferenceNeeded();
      case "privacy.erasure_not_approved":
        return m.privacyErrErasureNotApproved();
      case "privacy.erased":
        return m.privacyErrErased();
      case "privacy.erasure_unavailable":
        return m.privacyErasureUnavailable();
      case "privacy.erasure_blocked":
        return m.privacyErrErasureBlocked();
      case "privacy.erasure_pending":
        return m.privacyErrErasurePending();
      case "file.quota_school":
        return m.fileQuotaSchool();
      case "file.quota_class":
        return m.fileQuotaClass();
      case "file.quota_module":
        return m.fileQuotaModule();
      case "file.quota_person":
        return m.fileQuotaPerson();
      case "file.not_ready":
        return m.errorFileNotAttachable();
      case "file.not_pending":
      case "file.part_missing":
        return m.fileErrUploadAgain();
      case "file.failed":
        return m.fileUploadFailed();
      case "site.slug_taken":
        return m.siteErrSlugTaken();
      case "site.home":
      case "site.home_exists":
        return m.siteErrHome();
      case "site.has_children":
        return m.siteErrHasChildren();
      case "site.portal_page":
        return m.siteErrPortalPage();
      case "site.system_section":
        return m.siteErrSystemSection();
      case "site.parent":
        return m.siteErrParent();
      case "site.empty":
        return m.siteErrEmpty();
      case "site.issues":
        return m.siteErrIssues();
      case "site.consent":
        return m.siteErrConsent();
      case "site.file":
        return m.siteErrFile();
      case "site.title":
        return m.siteErrTitle();
      case "site.link":
        return m.siteErrLink();
      case "site.embed":
        return m.siteErrEmbed();
      case "site.too_many":
        return m.siteErrTooMany();
      case "site.form":
        return m.siteErrForm();
      case "hosts.taken":
        return m.siteErrHostTaken();
      case "hosts.exists":
        return m.siteErrHostExists();
      case "hosts.limit_reached":
        return m.siteErrHostLimit();
      case "hosts.platform":
        return m.siteErrHostPlatform();
      case "hosts.invalid":
        return m.siteErrHostInvalid();
      case "hosts.unavailable":
        return m.siteAddressesUnavailable();
      case "site.challenge":
        return m.siteErrChallenge();
      case "site.slug":
        return m.siteSlugNeeded();
      case "enquiry.reach":
        return m.admErrReach();
      case "enquiry.assignee":
        return m.admErrAssignee();
      case "enquiry.state":
        return m.admErrState();
      case "enquiry.reason":
        return m.admErrReason();
      case "intake.form_unpublished":
        return m.errIntakeFormUnpublished();
      case "intake.fixed":
        return m.errIntakeFixed();
      case "intake.year":
        return m.errIntakeYear();
      case "intake.grade":
        return m.errIntakeGrade();
      case "intake.exists":
        return m.errIntakeExists();
      case "intake.dates":
        return m.itkErrDates();
      case "intake.ages":
        return m.itkErrAges();
      case "intake.letter":
        return m.itkErrLetter();
      case "coding.unavailable":
        return m.codingUnavailable();
      case "intake.checklist":
        return m.itkErrChecklist();
      case "form.question_unready":
        return m.errFormQuestionUnready();
      case "form.unchanged":
        return m.errFormUnchanged();
      case "form.stale":
        return m.errFormStale();
      case "form.name":
        return m.afmErrName();
      case "admissions.full":
        return m.errAdmissionsFull();
      case "enrol.not_matched":
        return m.errEnrolNotMatched();
      case "defer.later_year":
        return m.errDeferLaterYear();
      case "event.times":
        return m.errEventTimes();
      case "event.item":
        return m.errEventItem();
      case "event.attendee":
        return m.errEventAttendee();
      case "templates.kept":
        return m.errTemplatesKept();
      case "application.sent":
        return m.errApplicationSent();
      case "application.intake_closed":
        return m.errApplicationClosed();
      case "application.age_young":
        return m.errApplicationYoung();
      case "application.age_old":
        return m.errApplicationOld();
      case "application.child":
        return m.errApplicationChild();
      case "application.relation":
        return m.errApplicationRelation();
      case "application.responsible":
        return m.errApplicationResponsible();
      case "application.consent":
        return m.errApplicationConsent();
      case "application.consent_words":
        return m.errApplicationConsentWords();
      case "application.state":
        return m.errApplicationState();
      case "application.item_done":
        return m.errApplicationItemDone();
      case "application.item_full":
        return m.errApplicationItemFull();
      case "application.item_state":
        return m.errApplicationItemState();
      case "application.not_sent":
        return m.errApplicationNotSent();
      case "application.exists":
        return m.errApplicationExists();
      case "application.stale":
        return m.errApplicationStale();
      case "register.no_mail":
        return m.registerErrNoMail();
      case "register.not_sent":
        return m.errRegisterNotSent();
      case "learning.disabled":
        return m.learningDisabled();
      case "learning.no_year":
        return m.lrnErrNoYear();
      case "learning.unit_dates":
        return m.lrnErrUnitDates();
      case "learning.unit_dates_year":
        return m.lrnErrUnitDatesYear();
      case "learning.class":
        return m.lrnErrClass();
      case "learning.prerequisite":
        return m.lrnErrPrerequisite();
      case "learning.condition":
        return m.lrnErrCondition();
      case "learning.condition_order":
        return m.lrnErrConditionOrder();
      case "learning.condition_unscored":
        return m.lrnErrConditionUnscored();
      case "learning.translation_language":
        return m.lrnErrTranslationLanguage();
      case "learning.nothing_to_check":
      case "coursework.nothing_to_check":
        return m.translationErrNothingToCheck();
      case "coursework.translation_language":
        return m.courseworkErrTranslationLanguage();
      case "learning.condition_in_use":
        return m.lrnErrConditionInUse();
      case "learning.paced_paused":
        return m.lrnErrPacedPaused();
      case "learning.paced_ahead":
        return m.lrnErrPacedAhead();
      case "learning.paced_ended":
        return m.lrnErrPacedEnded();
      case "learning.paced_unshown":
        return m.lrnErrPacedUnshown();
      case "learning.paced_running":
        return m.lrnErrPacedRunning();
      case "learning.lesson_required":
        return m.lrnErrLessonRequired();
      case "learning.lesson_empty":
        return m.lrnErrLessonEmpty();
      case "learning.lesson_incomplete":
        return m.lrnErrLessonIncomplete();
      case "learning.hotspot_needed":
        return m.lrnHotspotNeeded();
      case "learning.no_python":
        return m.lrnErrNoPython();
      case "files.no_captions":
        return m.fileErrNoCaptions();
      case "files.not_linkable":
        return m.errorFileNotAttachable();
      case "learning.locked":
        return m.lrnErrLocked();
      case "learning.not_done":
        return m.lrnErrNotDone();
      case "learning.results_unanswered":
        return m.lrnErrResultsUnanswered();
      case "learning.results_waiting":
        return m.lrnErrResultsWaiting();
      case "learning.no_results":
        return m.lrnErrNoResults();
      case "learning.young_feedback":
        return m.lrnErrYoungFeedback();
      case "learning.no_hint":
        return m.lrnErrNoHint();
      case "learning.bank_options":
        return m.lrnErrBankOptions();
      case "learning.poll_first":
        return m.lrnErrPollFirst();
      case "learning.labels_needed":
        return m.lrnErrLabelsNeeded();
      case "learning.crossword_layout":
        return m.lrnErrCrosswordLayout();
      case "learning.wordsearch_layout":
        return m.lrnErrWordSearchLayout();
      case "shared.not_owner":
        return m.sharedErrNotOwner();
      case "shared.title_needed":
        return m.sharedErrTitle();
      case "shared.content":
        return m.sharedErrContent();
      case "learning.number_line":
        return m.lrnErrNumberLine();
      case "learning.number_line_answer":
        return m.lrnErrNumberLineAnswer();
      case "learning.unreviewed":
      case "coursework.unreviewed":
        return m.lrnErrUnreviewed();
      case "coursework.assessed_exists":
      case "coursework.authenticated_already":
      case "coursework.class_fixed":
        return m.errorConflictVersion();
      case "coursework.no_declaration":
        return m.courseworkErrNoDeclaration();
      case "coursework.not_assessed":
        return m.courseworkErrNotAssessed();
      case "learning.option":
        return m.lrnErrOption();
      case "learning.pass_score":
        return m.lrnPassScoreNeeded();
      case "learning.needs_quiz":
        return m.lrnRuleNeedsQuiz();
      case "learning.needs_reflection":
        return m.lrnRuleNeedsReflection();
      case "learning.needs_media":
        return m.lrnRuleNeedsMedia();
      case "learning.gate_opens_nothing":
        return m.lrnGateOpensNothing();
      case "learning.young_gate":
        return m.lrnErrYoungGate();
      case "learning.gate_goal":
        return m.lrnErrGateGoal();
      case "learning.gate_score":
        return m.lrnErrGateScore();
      case "learning.captions_required":
        return m.lrnErrCaptions();
      case "learning.correct_option":
        return m.lrnCorrectNeeded();
      case "learning.settled":
        return m.lrnErrSettled();
      case "learning.word_limit":
        return m.lrnErrWordLimit();
      case "learning.points_over":
        return m.lrnErrPointsOver();
      case "learning.fluency":
        return m.fluencyErr();
      case "learning.response":
        return m.lrnErrResponse();
      case "learning.nothing_to_retry":
        return m.lrnErrNothingToRetry();
      case "learning.module_draft":
        return m.lrnErrModuleDraft();
      case "learning.part_unnamed":
        return m.lrnPictureUnnamed();
      case "learning.gap_options":
        return m.lrnGapChoices();
      case "learning.gaps_needed":
        return m.lrnGapsNeeded();
      case "learning.number_range":
        return m.lrnRangeOrder();
      case "learning.math_key_units":
        return m.lrnMathKeyUnits();
      case "learning.math_key_form":
        return m.lrnMathKeyForm();
      case "learning.duplicate_ids":
        return m.lrnErrDuplicateIds();
      case "learning.sort_group":
        return m.lrnErrSortGroup();
      case "learning.reading":
        return m.lrnErrReading();
      case "learning.share_unsent":
        return m.lrnErrShareUnsent();
      case "learning.project_file":
        return m.projectFileBad();
      case "learning.project_file_taken":
        return m.projectFileTaken();
      case "learning.project_too_large":
        return m.projectTooLarge();
      case "learning.project_page":
        return m.projectPageNeeded();
      case "module_class.exists":
        return m.lrnErrClassTwice();
      case "student.reference_taken":
        return m.managementReferenceConflict();
      case "auth.invalid_credentials":
        return m.authInvalidCredentials();
      case "badges.not_young":
        return m.badgesNotYoung();
      case "account.not_young":
        return m.accountNotYoung();
      case "account.disabled":
        return m.accountDisabled();
      case "account.exists":
        return m.errorConflictVersion();
      case "calendar.ends_before":
        return m.calEndsBefore();
      case "calendar.times_needed":
        return m.calTimesNeeded();
      case "calendar.cancel_first":
        return m.calCancelFirst();
      case "calendar.audience":
        return m.calAudienceNotAllowed();
      case "calendar.title_needed":
        return m.calTitleNeeded();
      case "lti.url":
      case "lti.https":
        return m.ltiErrUrl();
      case "lti.custom_too_many":
        return m.ltiErrCustom();
      case "lti.client_exists":
      case "lti.key_exists":
        return m.ltiErrRace();
      case "org.identifier_taken":
        return m.errorSchoolIdentifierTaken();
      case "org_feature.exists":
        return m.errorConflictVersion();
      case "descriptor.code_taken":
        return m.errorSubjectCodeTaken();
      case "descriptor_override.exists":
        return m.errorConflictVersion();
      case "calendar_feed.exists":
        return m.ltiErrRace();
      case "file_subject.exists":
        return m.errorConflictVersion();
      case "user.username_taken":
        return m.signInLoginTaken();
      case "user.birth_date_early":
        return m.errorBirthDateTooEarly();
      case "placement.overlapping":
        return m.errorPlacementOverlapping();
      case "class_group_member.exists":
        return m.errorConflictVersion();
      case "assignment_recipient.exists":
        return m.errorConflictVersion();
      case "submission_attempt.number_taken":
        return m.errorConflictVersion();
      case "role.overlapping":
        return m.errorConflictVersion();
      case "relationship.overlapping":
        return m.errorRelationshipExists();
      case "relationship.portal_without_rights":
        return m.errorPortalWithoutRights();
      case "relationship.non_relative_portal":
        return m.errorNonRelativePortal();
      case "relationship.self":
        return m.errorRelationshipSelf();
      case "access_role.builtin_exists":
        return m.errorConflictVersion();
      case "access_role_assignment.overlapping":
        return m.errorAccessAssignmentOverlapping();
      case "document_file.exists":
        return m.errorConflictVersion();
      case "user_preference.exists":
        return m.errorConflictVersion();
      case "database.busy":
        return m.errorDatabaseBusy();
      case "validation.required":
        return m.errorValidationRequired();
      case "validation.invalid":
        return m.errorValidationInvalid();
      case "tenant.read_only":
        return m.errorTenantReadOnly();
      case "login_identity.login_name_taken":
        return m.signInLoginTaken();
      case "fee.amount":
        return m.itkErrFee();
    }
    if (error.message.startsWith("validation."))
      return validationMessage({ message: error.message });
    if (error.message.startsWith(REGISTERS_AFTER))
      return m.enrollmentRegistersAfter({
        date: formatDate(error.message.slice(REGISTERS_AFTER.length)),
      });
    if (error.message.startsWith(PERIOD_REGISTERS_AFTER))
      return m.periodsRegistersAfter({
        date: formatDate(error.message.slice(PERIOD_REGISTERS_AFTER.length)),
      });
    if (error.message.startsWith(PERIOD_COVER_AFTER))
      return m.periodsCoverAfter({
        date: formatDate(error.message.slice(PERIOD_COVER_AFTER.length)),
      });
    if (error.message.endsWith(".conflict")) return m.errorConflictVersion();
    if (error.message.endsWith(".reference_invalid"))
      return m.errorReferenceGone();
    if (error.message.endsWith(".invalid")) return m.errorInvalidGeneric();
    if (!isErrorCode(error.message))
      return UNCODED[error.message]?.() ?? error.message;
    if (import.meta.env.DEV && !INTERNAL_CODES.has(error.message))
      console.warn(`No copy in utils/error.ts reads ${error.message}`);
    return m.notificationErrorMessage();
  }
  return m.notificationErrorMessage();
}

/**
 * Where a refusal from the server is shown: on the field its code names in
 * `fields`, or for the form as a whole. Null while nothing was refused.
 */
export function refusalOf<F extends string>(
  error: unknown,
  fields: Partial<Record<string, F>>,
): { field: F | null; message: string } | null {
  if (!error) return null;
  const field = error instanceof Error ? (fields[error.message] ?? null) : null;
  return { field, message: getMessageFromError(error) };
}
