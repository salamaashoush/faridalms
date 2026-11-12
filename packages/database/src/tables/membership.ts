import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, smallint, text, uuid } from "drizzle-orm/pg-core";

import { calendars, academicSessions } from "./calendar";
import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  erase,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  purposeGate,
  range,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { files } from "./files";
import { users } from "./people";
import { importRuns } from "./records";
import { orgs, tenants } from "./tenancy";

export type NextYearOutcome = "promote" | "retain" | "leave" | "graduate";

export const studentSchoolYears = core.table.withRLS(
  "student_school_years",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    validDuring: daterange("valid_during").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id"),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    calendarId: uuid("calendar_id"),
    entryTypeDescriptorId: uuid("entry_type_descriptor_id"),
    entryTypeNs: text("entry_type_ns")
      .notNull()
      .generatedAlwaysAs(sql`'school_entry_type'`),
    exitTypeDescriptorId: uuid("exit_type_descriptor_id"),
    exitTypeNs: text("exit_type_ns")
      .notNull()
      .generatedAlwaysAs(sql`'school_exit_type'`),
    nextYearOutcome: text("next_year_outcome").$type<NextYearOutcome>(),
    /** Whether the family means the student to return next year, as they or the office said. */
    nextYearIntention: text("next_year_intention").$type<
      "returning" | "undecided" | "leaving"
    >(),
    intentionByUserId: uuid("intention_by_user_id"),
    intentionAt: instant("intention_at"),
    /** The school a student came from, as their papers or family say. */
    previousSchool: text("previous_school"),
    /** Where a student who left went on to, as the family told the office. */
    destinationSchool: text("destination_school"),
    source: text("source")
      .$type<
        "manual" | "import" | "sis" | "oneroster" | "rollover" | "admission"
      >()
      .notNull(),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("student_school_years", t.tenantId, t.id),
    ...baseConstraints("student_school_years", t, tenants),
    fk(
      "student_school_years",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.calendarId, t.schoolYearId],
      [calendars.tenantId, calendars.id, calendars.schoolYearId],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.entryTypeDescriptorId, t.entryTypeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.exitTypeDescriptorId, t.exitTypeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.intentionByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "student_school_years",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck(
      "student_school_years",
      "next_year_outcome",
      sql`next_year_outcome in ('promote', 'retain', 'leave', 'graduate')`,
    ),
    ck(
      "student_school_years",
      "next_year_intention",
      sql`next_year_intention in ('returning', 'undecided', 'leaving')`,
    ),
    ck(
      "student_school_years",
      "intention_recorded",
      sql`(next_year_intention is null) = (intention_at is null)`,
    ),

    ck(
      "student_school_years",
      "source",
      sql`source in ('manual', 'import', 'sis', 'oneroster', 'rollover', 'admission')`,
    ),
    ck("student_school_years", "valid_during", range.bounded("valid_during")),
    ck(
      "student_school_years",
      "previous_school",
      sql`char_length(previous_school) between 1 and 160`,
    ),
    ck(
      "student_school_years",
      "destination_school",
      sql`char_length(destination_school) between 1 and 160`,
    ),
    index("student_school_years_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("student_school_years_year_idx")
      .on(t.tenantId, t.schoolYearId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("student_school_years_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("student_user_id")),
  ],
);

export const NATURAL_ROLES = [
  "student",
  "teacher",
  "aide",
  "counselor",
  "principal",
  "site_administrator",
  "district_administrator",
  "system_administrator",
  "proctor",
  "staff",
  "parent",
  "guardian",
  "relative",
  "applicant_family",
] as const;
export type NaturalRole = (typeof NATURAL_ROLES)[number];

export const userRoles = core.table.withRLS(
  "user_roles",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull(),
    role: text("role").$type<NaturalRole>().notNull(),
    validDuring: daterange("valid_during").notNull(),
    source: text("source")
      .$type<
        "manual" | "import" | "sis" | "oneroster" | "sso_jit" | "derived"
      >()
      .notNull(),
    positionDescriptorId: uuid("position_descriptor_id"),
    positionNs: text("position_ns")
      .notNull()
      .generatedAlwaysAs(sql`'staff_position'`),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("user_roles", t.tenantId, t.id),
    ...baseConstraints("user_roles", t, tenants),
    fk("user_roles", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "user_roles",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "user_roles",
      [t.tenantId, t.positionDescriptorId, t.positionNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "user_roles",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck(
      "user_roles",
      "role",
      sql`role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative', 'applicant_family')`,
    ),
    ck(
      "user_roles",
      "source",
      sql`source in ('manual', 'import', 'sis', 'oneroster', 'sso_jit', 'derived')`,
    ),
    ck("user_roles", "title_en", sql`char_length(title_en) between 1 and 100`),
    ck("user_roles", "title_ar", sql`char_length(title_ar) between 1 and 100`),
    ck("user_roles", "valid_during", range.started("valid_during")),
    ck(
      "user_roles",
      "org_type",
      sql`role = 'system_administrator' or (role = 'district_administrator' and org_type = 'school_group') or (role not in ('district_administrator', 'system_administrator') and org_type = 'school')`,
    ),
    index("user_roles_org_role_idx")
      .on(t.tenantId, t.orgId, t.role)
      .where(sql`status = 'active'`),
    index("user_roles_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    index("user_roles_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("user_id")),
  ],
);

export const userRelationships = core.table.withRLS(
  "user_relationships",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    relatedUserId: uuid("related_user_id").notNull(),
    relationDescriptorId: uuid("relation_descriptor_id").notNull(),
    relationNs: text("relation_ns")
      .notNull()
      .generatedAlwaysAs(sql`'relation'`),
    relationMeaning: text("relation_meaning").notNull(),
    legalGuardian: boolean("legal_guardian"),
    educationalRights: text("educational_rights")
      .$type<"full" | "restricted" | "none">()
      .notNull()
      .default("full"),
    portalAccess: boolean("portal_access").notNull().default(false),
    receivesNotifications: boolean("receives_notifications")
      .notNull()
      .default(false),
    communicationIsolated: boolean("communication_isolated")
      .notNull()
      .default(false),
    primaryContact: boolean("primary_contact").notNull().default(false),
    emergencyContact: boolean("emergency_contact").notNull().default(false),
    contactPriority: smallint("contact_priority"),
    residence: text("residence").$type<"primary" | "secondary" | "none">(),
    pickup: text("pickup").$type<"allowed" | "not_allowed" | "ask_office">(),
    validDuring: daterange("valid_during").notNull(),
    accessBasis: text("access_basis")
      .$type<
        | "parental_authority"
        | "court_appointed"
        | "student_consent"
        | "school_designated"
      >()
      .notNull()
      .default("parental_authority"),
    accessEndsAtMajority: boolean("access_ends_at_majority")
      .notNull()
      .default(true),
    verificationMethod: text("verification_method").$type<
      | "document"
      | "court_order"
      | "staff_attested"
      | "sis"
      | "import_unverified"
    >(),
    verifiedAt: instant("verified_at"),
    verifiedByUserId: uuid("verified_by_user_id"),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("user_relationships", t.tenantId, t.id),
    ...baseConstraints("user_relationships", t, tenants),
    fk(
      "user_relationships",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "user_relationships",
      [t.tenantId, t.relatedUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "user_relationships",
      [t.tenantId, t.relationDescriptorId, t.relationNs, t.relationMeaning],
      [
        descriptors.tenantId,
        descriptors.id,
        descriptors.namespace,
        descriptors.systemMeaning,
      ],
    ),
    fk(
      "user_relationships",
      [t.tenantId, t.verifiedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "user_relationships",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck(
      "user_relationships",
      "educational_rights",
      sql`educational_rights in ('full', 'restricted', 'none')`,
    ),
    ck(
      "user_relationships",
      "contact_priority",
      sql`contact_priority between 1 and 99`,
    ),
    ck(
      "user_relationships",
      "residence",
      sql`residence in ('primary', 'secondary', 'none')`,
    ),
    ck(
      "user_relationships",
      "pickup",
      sql`pickup in ('allowed', 'not_allowed', 'ask_office')`,
    ),
    ck(
      "user_relationships",
      "access_basis",
      sql`access_basis in ('parental_authority', 'court_appointed', 'student_consent', 'school_designated')`,
    ),
    ck(
      "user_relationships",
      "verification_method",
      sql`verification_method in ('document', 'court_order', 'staff_attested', 'sis', 'import_unverified')`,
    ),
    ck("user_relationships", "self", sql`student_user_id <> related_user_id`),
    ck("user_relationships", "valid_during", range.started("valid_during")),
    ck(
      "user_relationships",
      "verified",
      sql`(verified_at is null or verification_method is not null) and (verification_method is distinct from 'import_unverified' or verified_at is null)`,
    ),
    ck(
      "user_relationships",
      "portal",
      sql`not portal_access or educational_rights <> 'none'`,
    ),
    ck(
      "user_relationships",
      "non_relative",
      sql`relation_meaning <> 'non_relative' or not portal_access or access_basis = 'school_designated'`,
    ),
    index("user_relationships_related_idx")
      .on(t.tenantId, t.relatedUserId)
      .where(sql`status = 'active'`),
    index("user_relationships_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("user_relationships_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(
      sql`app.erasure_approved(tenant_id, student_user_id) or app.erasure_approved(tenant_id, related_user_id)`,
    ),
  ],
);

export const relationshipRestrictions = core.table.withRLS(
  "relationship_restrictions",
  {
    tenantId: uuid("tenant_id").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
    contactRestrictions: text("contact_restrictions"),
    courtOrderFileId: uuid("court_order_file_id"),
    courtOrderFilePurpose: text("court_order_file_purpose")
      .notNull()
      .default("legal_document"),
    verificationFileId: uuid("verification_file_id"),
    verificationFilePurpose: text("verification_file_purpose")
      .notNull()
      .default("evidence"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("relationship_restrictions", t.tenantId, t.relationshipId),
    ...baseConstraints("relationship_restrictions", t, tenants),
    fk(
      "relationship_restrictions",
      [t.tenantId, t.relationshipId],
      [userRelationships.tenantId, userRelationships.id],
    ),
    fk(
      "relationship_restrictions",
      [t.tenantId, t.courtOrderFileId, t.courtOrderFilePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    fk(
      "relationship_restrictions",
      [t.tenantId, t.verificationFileId, t.verificationFilePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    ck(
      "relationship_restrictions",
      "contact_restrictions",
      sql`char_length(contact_restrictions) between 1 and 250`,
    ),
    ck(
      "relationship_restrictions",
      "court_order_file_purpose",
      sql`court_order_file_purpose = 'legal_document'`,
    ),
    ck(
      "relationship_restrictions",
      "verification_file_purpose",
      sql`verification_file_purpose = 'evidence'`,
    ),
    ...entityProfile(),
    purposeGate("custody"),
    ...eraseAndDelete(
      sql`exists (select 1 from core.user_relationships r where r.tenant_id = relationship_restrictions.tenant_id and r.id = relationship_restrictions.relationship_id and (app.erasure_approved(r.tenant_id, r.student_user_id) or app.erasure_approved(r.tenant_id, r.related_user_id)))`,
    ),
  ],
);
