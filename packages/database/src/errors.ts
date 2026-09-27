/**
 * Maps a database error to a stable domain code. Constraint names are part of
 * the API: renaming a unique key or exclusion constraint is a breaking change,
 * and the source gate fails when one has no entry here.
 */
export const CONFLICTS: Record<string, string> = {
  orgs_root_key: "org.root_exists",
  orgs_identifier_key: "org.identifier_taken",
  org_features_key: "org_feature.exists",
  descriptors_code_key: "descriptor.code_taken",
  descriptor_overrides_key: "descriptor_override.exists",
  academic_sessions_current_key: "school_year.current_exists",
  academic_sessions_year_excl: "school_year.overlapping",
  academic_sessions_sibling_excl: "academic_session.overlapping",
  calendars_code_key: "calendar.code_taken",
  calendars_school_key: "calendar.school_calendar_exists",
  calendar_grade_levels_key: "calendar_grade_level.exists",
  calendar_dates_day_key: "calendar_date.exists",
  academic_weeks_number_key: "academic_week.number_taken",
  academic_weeks_excl: "academic_week.overlapping",
  class_periods_code_excl: "class_period.code_overlapping",
  class_periods_sequence_excl: "class_period.sequence_overlapping",
  locations_code_key: "location.code_taken",
  tenant_keys_active_key: "tenant_key.active_exists",
  file_publications_tenant_id_public_key_key: "file_publication.key_taken",
  file_subjects_key: "file_subject.exists",
  users_username_key: "user.username_taken",
  external_ids_identifier_key: "external_id.taken",
  external_ids_hmac_key: "external_id.taken",
  household_members_excl: "household_member.overlapping",
  contact_points_user_value_key: "contact_point.exists",
  student_school_years_excl: "placement.overlapping",
  courses_code_key: "course.code_taken",
  classes_code_key: "class.code_taken",
  enrollments_excl: "enrollment.overlapping",
  enrollments_homeroom_excl: "enrollment.homeroom_overlapping",
  class_group_members_key: "class_group_member.exists",
  assignment_recipients_key: "assignment_recipient.exists",
  submissions_key: "submission.exists",
  submission_attempts_number_key: "submission_attempt.number_taken",
  assessments_attempt_key: "assessment.exists",
  period_grades_key: "period_grade.exists",
  year_rollovers_years_key: "rollover.exists",
  attendance_settings_org_key: "attendance.stale",
  attendance_registers_key: "attendance.stale",
  attendance_events_key: "attendance.stale",
  class_meetings_class_excl: "timetable.class_busy",
  class_meetings_group_excl: "timetable.group_busy",
  class_meetings_teacher_excl: "timetable.teacher_busy",
  class_meetings_room_excl: "timetable.room_busy",
  user_roles_role_excl: "role.overlapping",
  user_relationships_excl: "relationship.overlapping",
  accounts_tenant_id_webauthn_user_handle_key: "account.handle_taken",
  accounts_user_key: "account.exists",
  identity_providers_issuer_key: "identity_provider.exists",
  identity_provider_orgs_key: "identity_provider_org.exists",
  login_identities_subject_key: "login_identity.subject_taken",
  login_identities_login_name_key: "login_identity.login_name_taken",
  passkeys_tenant_id_credential_id_key: "passkey.exists",
  sessions_tenant_id_token_hash_key: "session.exists",
  access_roles_builtin_key: "access_role.builtin_exists",
  access_role_assignments_excl: "access_role_assignment.overlapping",
  document_versions_tenant_id_document_id_document_version_re_key:
    "document_version.exists",
  document_translations_key: "document_translation.exists",
  document_files_key: "document_file.exists",
  user_preferences_key: "user_preference.exists",
};

/** Checks whose failure means something to a person, not just a bad shape. */
export const VALIDATIONS: Record<string, string> = {
  academic_sessions_year_end_check: "school_year.end_mismatch",
  academic_sessions_tree_check: "academic_session.parent_invalid",
  user_roles_org_type_check: "role.org_invalid",
  user_relationships_self_check: "relationship.self",
  user_relationships_portal_check: "relationship.portal_without_rights",
  user_relationships_non_relative_check: "relationship.non_relative_portal",
  external_ids_sensitive_check: "external_id.must_be_sealed",
  external_ids_suffix_check: "external_id.suffix_forbidden",
  contact_points_phone_check: "contact_point.phone_invalid",
  contact_points_email_check: "contact_point.email_invalid",
  contact_points_security_check: "contact_point.unverified",
  files_health_report_check: "file.health_report_invalid",
  descriptors_relation_token_check: "descriptor.relation_token_invalid",
};

export type DatabaseErrorKind =
  | "conflict"
  | "validation"
  | "frozen"
  | "stale"
  | "missing"
  | "retry"
  | "bug";

export interface MappedError {
  kind: DatabaseErrorKind;
  code: string;
}

interface PostgresErrorLike {
  errno?: string;
  code?: string;
  constraint?: string;
  message?: string;
  cause?: unknown;
}

function postgresError(error: unknown): PostgresErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== "object") return null;
    const candidate = current as PostgresErrorLike;
    if (candidate.errno && /^[0-9A-Z]{5}$/.test(candidate.errno))
      return candidate;
    current = candidate.cause;
  }
  return null;
}

const tableOf = (constraint: string) =>
  constraint.split("_").slice(0, -1).join("_");

/**
 * The domain meaning of a database failure, by SQLSTATE and constraint name,
 * or null when the error did not come from Postgres.
 */
export function mapDatabaseError(error: unknown): MappedError | null {
  const pg = postgresError(error);
  if (!pg) return null;
  const state = pg.errno ?? "";
  const constraint = pg.constraint ?? "";
  if (state === "23505" || state === "23P01")
    return {
      kind: "conflict",
      code: CONFLICTS[constraint] ?? `${tableOf(constraint)}.conflict`,
    };
  if (state === "23503")
    return {
      kind: "validation",
      code: `${tableOf(constraint)}.reference_invalid`,
    };
  if (state === "23514") {
    if (!constraint && pg.message?.includes("fall outside"))
      return { kind: "validation", code: "school_year.rows_outside_dates" };
    return {
      kind: "validation",
      code: VALIDATIONS[constraint] ?? `${tableOf(constraint)}.invalid`,
    };
  }
  if (state === "23502")
    return { kind: "validation", code: "validation.required" };
  if (state === "55000")
    return {
      kind: "frozen",
      code: pg.message?.includes("closed")
        ? "school_year.closed"
        : "document.frozen",
    };
  if (state === "F0412") return { kind: "stale", code: "conflict.version" };
  if (state === "P0002") return { kind: "missing", code: "not_found" };
  if (state === "57014" || state === "55P03")
    return { kind: "retry", code: "database.busy" };
  return { kind: "bug", code: `database.${state}` };
}
