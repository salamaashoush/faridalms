import * as v from "valibot";

import * as m from "~/i18n/messages";

export function validationMessage(issue: { message?: string }): string {
  switch (issue.message) {
    case "validation.new_password":
      return m.validationNewPassword();
    case "validation.time_zone":
      return m.validationTimeZone();
    case "validation.end_date":
      return m.validationEndDate();
    case "validation.file_type":
      return m.validationFileType();
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
    case "validation.official_twice":
      return m.periodsOfficialTwice();
    case "validation.official_break":
      return m.periodsOfficialBreak();
    case "validation.subject_code":
      return m.validationSubjectCode();
    case "validation.name_required":
      return m.validationNameRequired();
    case "validation.reference":
      return m.validationReference();
    case "validation.login_name":
      return m.validationLoginName();
    case "validation.role_required":
      return m.validationRoleRequired();
    case "validation.class_code":
      return m.validationClassCode();
    case "validation.subject_twice":
      return m.classesSubjectTwice();
  }
  if (!("type" in issue))
    return issue.message === undefined ||
      issue.message.startsWith("validation.")
      ? m.validationInvalid()
      : issue.message;
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

/**
 * A form's draft checked with the schema the API checks it with, as each
 * field's first problem in words. A problem belongs to the field its path
 * starts with, or to the one `fieldOf` names for it; a field made of rows,
 * such as a year's terms, may say one thing for a problem inside any row.
 */
export function schemaErrors<F extends string>(
  schema: v.GenericSchema,
  value: unknown,
  fieldOf: (key: string, path: readonly unknown[]) => F | undefined,
  inRows: Partial<Record<F, string>> = {},
): Partial<Record<F, string>> {
  const result = v.safeParse(schema, value);
  const found: Partial<Record<F, string>> = {};
  if (result.success) return found;
  for (const issue of result.issues) {
    const path = issue.path?.map((item) => item.key) ?? [];
    const [key] = path;
    const field = fieldOf(typeof key === "string" ? key : "", path);
    if (!field || found[field]) continue;
    found[field] =
      ((issue.path?.length ?? 0) > 1 ? inRows[field] : undefined) ??
      validationMessage(issue);
  }
  return found;
}
