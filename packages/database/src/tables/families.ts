import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { broadcasts } from "./broadcasts";
import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  erase,
  eraseAndDelete,
  fk,
  instant,
  ledgerProfile,
  pk,
  purposeGate,
  range,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { consentRecords } from "./documents";
import { calendarEvents } from "./events";
import { files } from "./files";
import { users } from "./people";
import { importRuns } from "./records";
import { tenants } from "./tenancy";

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

/** The link a guardian answered a consent through, kept beside the answer for as long as it is. */
export const consentGuardians = core.table.withRLS(
  "consent_guardians",
  {
    tenantId: uuid("tenant_id").notNull(),
    consentRecordId: uuid("consent_record_id").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("consent_guardians", t.tenantId, t.consentRecordId),
    fk("consent_guardians", [t.tenantId], [tenants.tenantId]),
    fk(
      "consent_guardians",
      [t.tenantId, t.consentRecordId],
      [consentRecords.tenantId, consentRecords.id],
    ),
    fk(
      "consent_guardians",
      [t.tenantId, t.relationshipId],
      [userRelationships.tenantId, userRelationships.id],
    ),
    index("consent_guardians_relationship_idx").on(
      t.tenantId,
      t.relationshipId,
    ),
    ...ledgerProfile(),
  ],
);

/** An announcement that goes to the families of every student. */
export const broadcastFamilies = core.table.withRLS(
  "broadcast_families",
  {
    ...tenantColumns(),
    broadcastId: uuid("broadcast_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("broadcast_families", t.tenantId, t.id),
    ...baseConstraints("broadcast_families", t, tenants),
    fk(
      "broadcast_families",
      [t.tenantId, t.broadcastId],
      [broadcasts.tenantId, broadcasts.id],
    ),
    uniqueIndex("broadcast_families_key")
      .on(t.tenantId, t.broadcastId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** A calendar event for the families of every student, as a broadcast's. */
export const calendarEventFamilies = core.table.withRLS(
  "calendar_event_families",
  {
    ...tenantColumns(),
    eventId: uuid("event_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendar_event_families", t.tenantId, t.id),
    ...baseConstraints("calendar_event_families", t, tenants),
    fk(
      "calendar_event_families",
      [t.tenantId, t.eventId],
      [calendarEvents.tenantId, calendarEvents.id],
    ),
    uniqueIndex("calendar_event_families_key")
      .on(t.tenantId, t.eventId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
