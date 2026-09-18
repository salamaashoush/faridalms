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
