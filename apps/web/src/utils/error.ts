import * as m from "~/i18n/messages";

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
    }
    if (error.message.startsWith("assignment.incomplete:"))
      return m.assignmentIncomplete();
    return error.message;
  }
  return m.notificationErrorMessage();
}
