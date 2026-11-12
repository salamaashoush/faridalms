import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

/** What leaving the school ended, as it stood, so a return gives back exactly that. */
export interface DepartureEnded {
  /**
   * The student role, and the day after its last before the student left
   * (null ran on); one only to begin later was dropped whole.
   */
  role: { id: string; until: string | null; dropped: boolean } | null;
  /** Class enrollments cut short on the leaving day, each with its end before. */
  enrollments: { id: string; until: string | null }[];
  /** Enrollments that were to begin after and were dropped. */
  dropped: string[];
  /** What each module ended with the departure, by module, for it to give back. */
  parts: Record<string, unknown>;
}

/**
 * A student leaving the school: the day they are no longer one, which their
 * student role ends on, and the day the record closes to them and their
 * family, which may be later so they read the last reports. What leaving
 * ended is kept so a return restores it. One stands at a time; a return
 * tombstones it.
 */
export const studentDepartures = core.table.withRLS(
  "student_departures",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    studentUserId: uuid("student_user_id").notNull(),
    /** The first day the student is not at the school. */
    leftOn: date("left_on", { mode: "string" }).notNull(),
    /** The first day the student and their family no longer read the record. */
    accessEndsOn: date("access_ends_on", { mode: "string" }).notNull(),
    ended: jsonb("ended").$type<DepartureEnded>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("student_departures", t.tenantId, t.id),
    ...baseConstraints("student_departures", t, tenants),
    fk(
      "student_departures",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "student_departures",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("student_departures", "org_type", sql`org_type = 'school'`),
    ck("student_departures", "access", sql`access_ends_on >= left_on`),
    ck(
      "student_departures",
      "ended",
      sql`jsonb_typeof(ended) = 'object' and octet_length(ended::text) <= 262144`,
    ),
    uniqueIndex("student_departures_student_key")
      .on(t.tenantId, t.orgId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...erase(erasureOf("student_user_id")),
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
