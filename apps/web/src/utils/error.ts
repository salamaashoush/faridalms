import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";
import { validationMessage } from "~/utils/validation";

/** Followed by the last day a register was taken, which the move would change. */
export const MOVE_DATE_REGISTERS = "management.move_date_registers:";

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
      case "system.moving":
        return m.systemMoving();
      case "conflict.version":
        return m.errorConflictVersion();
      case "contact_point.phone_invalid":
        return m.errorPhoneInvalid();
      case "access.last_manager":
        return m.errorAccessLastManager();
      case "access.not_held":
        return m.errorAccessNotHeld();
      case "account.self":
        return m.errorAccountSelf();
      case "school.week_start_weekend":
        return m.errorWeekStartWeekend();
      case "class.code_taken":
        return m.errorClassCodeTaken();
      case "school_year.closed":
        return m.errorSchoolYearClosed();
      case "enrollment.future_placement":
        return m.errorFuturePlacement();
      case "enrollment.outside_year":
      case "enrollment.outside_dates":
        return m.errorEnrollmentOutsideYear();
      case "content.invalid":
        return m.contentInvalid();
      case "newsletter.revision_conflict":
        return m.newsletterDraftConflict();
      case "newsletter.invalid_text":
        return m.newsletterInvalidText();
      case "message_draft.revision_conflict":
        return m.messageDraftConflict();
      case "message_draft.incomplete":
        return m.messageDraftIncomplete();
      case "attendance.revision_conflict":
        return m.attendanceRevisionConflict();
      case "attendance.outside_year":
        return m.attendanceOutsideYear();
      case "attendance.future_date":
        return m.attendanceFutureDate();
      case "attendance.roster_changed":
        return m.attendanceRosterChanged();
      case "attendance.class_conflict":
        return m.attendanceClassConflict();
      case "attendance.class_missing":
        return m.attendanceClassMissing();
      case "attendance.responsibility_changed":
        return m.attendanceResponsibilityChanged();
      case "enrollment.scheduled_conflict":
        return m.enrollmentScheduledConflict();
      case "academic_year.name_conflict":
        return m.academicYearNameConflict();
      case "academic_year.revision_conflict":
        return m.academicYearRevisionConflict();
      case "academic_year.shrink":
        return m.academicYearShrink();
      case "academic_year.term_outside":
        return m.validationTermOutside();
      case "academic_year.term_overlap":
        return m.validationTermOverlap();
      case "academic_year.term_name_conflict":
        return m.validationTermNameConflict();
      case "academic_year.term_not_found":
        return m.academicYearTermNotFound();
      case "academic_year.term_in_use":
        return m.academicYearTermInUse();
      case "timetable.class_not_found":
        return m.timetableClassNotFound();
      case "timetable.revision_conflict":
        return m.timetableRevisionConflict();
      case "timetable.overlap":
        return m.validationSlotOverlap();
      case "timetable.subject_not_offered":
        return m.timetableSubjectNotOffered();
      case "timetable.teacher_not_found":
        return m.timetableTeacherNotFound();
      case "timetable.teacher_busy":
        return m.timetableTeacherBusy();
      case "academic_year.closed":
        return m.academicYearClosedError();
      case "academic_year.transition":
        return m.academicYearTransitionError();
      case "academic_year.default_closing":
        return m.academicYearDefaultClosingError();
      case "academic_year.reason_required":
        return m.academicYearReasonRequired();
      case "academic_year.reopen_forbidden":
        return m.academicYearReopenForbidden();
      case "academic_year.not_active":
        return m.academicYearNotActive();
      case "rollover.duplicate_class":
        return m.rolloverDuplicateClass();
      case "rollover.duplicate_name":
        return m.rolloverDuplicateName();
      case "rollover.duplicate_subject":
        return m.rolloverDuplicateSubject();
      case "rollover.duplicate_student":
        return m.rolloverDuplicateStudent();
      case "rollover.withdraw_target":
        return m.rolloverWithdrawTarget();
      case "rollover.missing_target":
        return m.rolloverMissingTarget();
      case "rollover.source_planning":
        return m.rolloverSourcePlanning();
      case "rollover.overlap":
        return m.rolloverOverlap();
      case "rollover.applied":
        return m.rolloverAlreadyApplied();
      case "rollover.revision_conflict":
        return m.rolloverRevisionConflict();
      case "rollover.not_saved":
        return m.rolloverNotSaved();
      case "rollover.plan_stale":
        return m.rolloverPlanStale();
      case "rollover.name_taken":
        return m.rolloverNameTaken();
      case "academic_year.not_found":
        return m.academicYearNotFound();
      case "assignment.revision_conflict":
        return m.assignmentRevisionConflict();
      case "assignment.not_found":
        return m.assignmentNotFound();
      case "assignment.subject_not_taught":
        return m.assignmentSubjectNotTaught();
      case "assignment.responsibility":
        return m.assignmentResponsibility();
      case "assignment.archived":
        return m.assignmentArchivedError();
      case "assignment.resource_missing":
        return m.assignmentResourceMissing();
      case "assignment.class_changed":
        return m.assignmentClassChanged();
      case "assignment.not_draft":
        return m.assignmentNotDraft();
      case "submission.scheduled":
        return m.submissionScheduledError();
      case "submission.closed":
        return m.submissionClosedError();
      case "submission.resubmission_closed":
        return m.submissionResubmissionClosed();
      case "submission.revision_conflict":
        return m.submissionRevisionConflict();
      case "submission.empty":
        return m.submissionEmpty();
      case "submission.both_required":
        return m.submissionBothRequired();
      case "submission.written_not_accepted":
        return m.submissionWrittenNotAccepted();
      case "submission.files_not_accepted":
        return m.submissionFilesNotAccepted();
      case "submission.too_many_files":
        return m.submissionTooManyFiles();
      case "submission.file_missing":
        return m.submissionFileMissing();
      case "submission.file_too_large":
        return m.submissionFileTooLarge();
      case "assessment.not_found":
        return m.assessmentNotFound();
      case "assessment.score_range":
        return m.assessmentScoreRange();
      case "assessment.rubric_mismatch":
        return m.assessmentRubricMismatch();
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
      case "group.name_conflict":
        return m.groupNameConflict();
      case "group.student_not_enrolled":
        return m.groupStudentNotEnrolled();
      case "group.not_found":
        return m.groupNotFound();
      case "message.empty":
        return m.messageEmptyError();
      case "message.file_missing":
        return m.messageFileMissing();
      case "announcement.revision_conflict":
        return m.announcementRevisionConflict();
      case "announcement.not_found":
        return m.announcementNotFound();
      case "announcement.incomplete":
        return m.announcementIncomplete();
      case "newsletter.incomplete":
        return m.newsletterIncomplete();
      case "newsletter.not_found":
        return m.academicYearNotFound();
      case "site.revision_conflict":
        return m.siteRevisionConflict();
      case "site.slug_taken":
        return m.siteSlugTaken();
      case "site.incomplete":
        return m.siteIncomplete();
      case "site.page_published":
        return m.sitePagePublished();
      case "site.not_found":
        return m.siteNotFound();
      case "learning.revision_conflict":
        return m.learningRevisionConflict();
      case "learning.incomplete":
        return m.learningIncomplete();
      case "learning.not_found":
        return m.learningNotFound();
      case "learning.responsibility":
        return m.learningResponsibility();
      case "learning.subject_not_taught":
        return m.learningSubjectNotTaught();
      case "learning.media_missing":
        return m.learningMediaMissing();
      case "learning.quizzes_pending":
        return m.learningQuizzesPending();
      case "learning.disabled":
        return m.learningDisabled();
      case "access.escalation":
        return m.accessEscalation();
      case "access.revision_conflict":
        return m.accessRevisionConflict();
      case "access.not_found":
        return m.accessNotFound();
      case "access.base_role_fixed":
        return m.accessBaseRoleFixed();
      case "access.base_role_mismatch":
        return m.accessBaseRoleMismatch();
      case "access.last_administrator":
        return m.accessLastAdministrator();
      case "access.self_lockout":
        return m.accessSelfLockout();
      case "access.user_not_found":
        return m.accessUserNotFound();
      case "management.self_admin_removal":
        return m.managementSelfAdminRemoval();
      case "management.email_in_use":
        return m.managementEmailInUse();
      case "management.account_not_found":
        return m.managementAccountNotFound();
      case "management.role_relationships":
        return m.managementRoleRelationships();
      case "management.birthdate_future":
        return m.managementBirthdateFuture();
      case "management.class_not_current":
        return m.managementClassNotCurrent();
      case "management.parents_invalid":
        return m.managementParentsInvalid();
      case "management.student_account_invalid":
        return m.managementStudentAccountInvalid();
      case "management.account_linked":
        return m.managementAccountLinked();
      case "management.student_not_found":
        return m.managementStudentNotFound();
      case "management.teachers_inactive":
        return m.managementTeachersInactive();
      case "management.subject_duplicate":
        return m.managementSubjectDuplicate();
      case "management.subject_not_found":
        return m.managementSubjectNotFound();
      case "management.class_name_conflict":
        return m.managementClassNameConflict();
      case "management.class_not_found":
        return m.managementClassNotFound();
      case "management.subject_code_conflict":
        return m.managementSubjectCodeConflict();
      case "management.reference_conflict":
        return m.managementReferenceConflict();
      case "management.move_date_future":
        return m.managementMoveDateFuture();
      case "management.move_date_early":
        return m.managementMoveDateEarly();
      case "assignment.no_student_record":
        return m.assignmentNoStudentRecord();
      case "auth.invalid_credentials":
        return m.authInvalidCredentials();
      case "grading.score_exceeds_max":
        return m.gradingScoreExceedsMax();
      case "assignment.due_in_past":
        return m.assignmentDueInPast();
      case "calendar.revision_conflict":
        return m.calendarRevisionConflict();
    }
    if (error.message.startsWith("validation."))
      return validationMessage({ message: error.message });
    if (error.message.startsWith("assignment.incomplete:"))
      return m.assignmentIncomplete();
    if (error.message.startsWith(MOVE_DATE_REGISTERS))
      return m.managementMoveDateRegisters({
        date: formatDate(error.message.slice(MOVE_DATE_REGISTERS.length)),
      });
    return error.message;
  }
  return m.notificationErrorMessage();
}
