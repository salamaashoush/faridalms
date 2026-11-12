import type { OwnershipViolations } from "./ownership";

/**
 * Keys, namespace columns and concept columns that reach a module their
 * table's owner may not, by the module reached. `bun run db:verify` fails
 * on a violation missing here and on an entry that no longer occurs, so the
 * list only shrinks; each group stays sorted.
 */
export const OWNERSHIP_VIOLATIONS: OwnershipViolations = {
  school_years: [
    "core.admission_intakes: admission_intakes_tenant_id_school_year_id_school_year_typ_fkey -> core.academic_sessions",
    "core.admission_intakes: school_year_id -> school_years",
    "core.admission_intakes: school_year_type -> school_years",
    "core.assignments: assignments_tenant_id_grading_period_id_fkey -> core.academic_sessions",
    "core.assignments: grading_period_id -> school_years",
    "core.assignments: school_year_id -> school_years",
    "core.learning_modules: learning_modules_tenant_id_school_year_id_fkey -> core.academic_sessions",
    "core.learning_modules: school_year_id -> school_years",
  ],
  grade_levels: [
    "core.admission_intakes: grade_level_ns -> grade_level",
    "core.broadcast_audiences: grade_ns -> grade_level",
    "core.calendar_event_audiences: grade_ns -> grade_level",
    "core.classes: grade_level_ns -> grade_level",
    "core.courses: grade_level_ns -> grade_level",
    "core.student_school_years: grade_level_ns -> grade_level",
  ],
  families: [
    "core.admission_applications: family_user_id -> families",
    "core.consent_records: consent_records_tenant_id_relationship_id_fkey -> core.user_relationships",
    "core.consent_records: relationship_id -> families",
    "core.site_enquiries: family_user_id -> families",
    "core.users: custody_alert -> families",
    "health.requested_changes: relationship_id -> families",
    "health.requested_changes: requested_changes_tenant_id_relationship_id_fkey -> core.user_relationships",
  ],
  coursework: [
    "core.classes: classes_tenant_id_grade_scale_id_fkey -> core.grade_scales",
    "core.classes: classes_tenant_id_programme_id_fkey -> core.programmes",
    "core.goal_judgements: goal_judgements_tenant_id_submission_id_student_user_id_fkey -> core.submissions",
    "core.standard_evidence: standard_evidence_tenant_id_submission_id_student_user_id_fkey -> core.submissions",
  ],
  elearning: [
    "core.assignments: assignments_tenant_id_module_id_fkey -> core.learning_modules",
    "core.goal_judgements: goal_judgements_tenant_id_lesson_id_fkey -> core.lessons",
    "core.standard_evidence: standard_evidence_tenant_id_lesson_id_fkey -> core.lessons",
  ],
  website: [
    "core.broadcasts: broadcasts_tenant_id_category_id_fkey -> core.site_categories",
  ],
  sso: [
    "core.login_identities: login_identities_tenant_id_identity_provider_id_fkey -> core.identity_providers",
  ],
};
