import * as m from "~/i18n/messages";

export function validationMessage(issue: { message?: string }): string {
  switch (issue.message) {
    case "validation.new_password":
      return m.validationNewPassword();
    case "validation.time_zone":
      return m.validationTimeZone();
    case "validation.https":
      return m.validationHttps();
    case "validation.end_date":
      return m.validationEndDate();
    case "validation.due_after_available":
      return m.validationDueAfterAvailable();
    case "validation.close_after_due":
      return m.validationCloseAfterDue();
    case "validation.deduction_required":
      return m.validationDeductionRequired();
    case "validation.attachments_required":
      return m.validationAttachmentsRequired();
    case "validation.rubric_total":
      return m.validationRubricTotal();
    case "validation.file_type":
      return m.validationFileType();
    case "validation.message_body":
      return m.validationMessageBody();
    case "validation.term_outside":
      return m.validationTermOutside();
    case "validation.term_overlap":
      return m.validationTermOverlap();
    case "validation.term_name_conflict":
      return m.validationTermNameConflict();
    case "validation.end_time":
      return m.validationEndTime();
    case "validation.slot_overlap":
      return m.validationSlotOverlap();
    case "validation.subject_code":
      return m.validationSubjectCode();
  }
  if (!("type" in issue)) return issue.message ?? m.validationInvalid();
  const count =
    "requirement" in issue && typeof issue.requirement === "number"
      ? issue.requirement
      : 0;
  switch (issue.type) {
    case "min_length":
      return count === 1
        ? m.validationRequired()
        : m.validationMinLength({ count });
    case "max_length":
      return m.validationMaxLength({ count });
    case "email":
      return m.validationEmail();
    case "iso_date":
    case "iso_date_time":
    case "iso_timestamp":
      return m.validationDate();
    case "uuid":
    case "picklist":
      return m.validationSelection();
    case "min_value":
      return m.validationMinValue({ count });
    case "max_value":
      return m.validationMaxValue({ count });
    case "url":
      return m.validationUrl();
    case "union": {
      if ("issues" in issue && Array.isArray(issue.issues)) {
        const nested = issue.issues.find(
          (value: unknown) =>
            typeof value === "object" &&
            value !== null &&
            "kind" in value &&
            value.kind === "validation",
        );
        if (nested) return validationMessage(nested);
      }
      return m.validationInvalid();
    }
    default:
      return m.validationInvalid();
  }
}
