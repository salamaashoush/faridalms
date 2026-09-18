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
    }
    return error.message;
  }
  return m.notificationErrorMessage();
}
