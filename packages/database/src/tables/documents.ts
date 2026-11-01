import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  bytea,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
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
  erasureListed,
  erasureOf,
  fk,
  health,
  instant,
  ledgerProfile,
  pk,
  purposeGate,
  roles,
  tenantColumns,
  uq,
} from "./conventions";
import { descriptors } from "./descriptors";
import { files, tenantKeys } from "./files";
import { userRelationships } from "./membership";
import { users } from "./people";
import { recordsRequests } from "./privacy";
import { orgs, tenants } from "./tenancy";

export const healthRecords = health.table.withRLS(
  "records",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    kindDescriptorId: uuid("kind_descriptor_id").notNull(),
    kindNs: text("kind_ns")
      .notNull()
      .generatedAlwaysAs(sql`'health_record_kind'`),
    hasAlert: boolean("has_alert").notNull().default(false),
    recordedOn: date("recorded_on", { mode: "string" }),
    keyPurpose: text("key_purpose")
      .notNull()
      .generatedAlwaysAs(sql`'health'`),
    keyVersion: integer("key_version").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    fileId: uuid("file_id"),
    filePurpose: text("file_purpose").notNull().default("health_report"),
    /** Whether a guardian who reads the summary may open the record's report. */
    reportShared: boolean("report_shared").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("records", t.tenantId, t.id),
    ...baseConstraints("records", t, tenants),
    fk("records", [t.tenantId, t.studentUserId], [users.tenantId, users.id]),
    fk(
      "records",
      [t.tenantId, t.kindDescriptorId, t.kindNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "records",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    fk(
      "records",
      [t.tenantId, t.fileId, t.filePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    ck(
      "records",
      "ciphertext",
      sql`octet_length(ciphertext) between 29 and 65565`,
    ),
    ck("records", "file_purpose", sql`file_purpose = 'health_report'`),
    ck(
      "records",
      "report_shared",
      sql`file_id is not null or not report_shared`,
    ),
    ck("records", "metadata_empty", sql`metadata = '{}'`),
    index("records_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    purposeGate("health"),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * The change a guardian asked for in a child's medical summary, carried by
 * their correction request, which holds its deadline and outcome. Nothing
 * here touches the record until the office accepts; the words asked for,
 * the record as the guardian read it and any reason for declining are
 * encrypted together.
 */
export const healthChanges = health.table.withRLS(
  "requested_changes",
  {
    ...tenantColumns(),
    requestId: uuid("request_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    target: text("target").$type<"record" | "contact">().notNull(),
    kindDescriptorId: uuid("kind_descriptor_id"),
    kindNs: text("kind_ns")
      .notNull()
      .generatedAlwaysAs(sql`'health_record_kind'`),
    recordId: uuid("record_id"),
    relationshipId: uuid("relationship_id"),
    keyPurpose: text("key_purpose")
      .notNull()
      .generatedAlwaysAs(sql`'health'`),
    keyVersion: integer("key_version").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    /** A report the family sent with the change, such as a doctor's letter. */
    // Keyed to files NOT VALID by the custom migration: drizzle-kit writes a
    // key on an existing table as validated, and validating reads the table
    // under forced row security, where a migration has no tenant.
    fileId: uuid("file_id"),
    filePurpose: text("file_purpose").notNull().default("health_report"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("requested_changes", t.tenantId, t.id),
    ...baseConstraints("requested_changes", t, tenants),
    fk(
      "requested_changes",
      [t.tenantId, t.requestId],
      [recordsRequests.tenantId, recordsRequests.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.requestedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.kindDescriptorId, t.kindNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.recordId],
      [healthRecords.tenantId, healthRecords.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.relationshipId],
      [userRelationships.tenantId, userRelationships.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    uq("requested_changes", t.tenantId, t.requestId),
    ck(
      "requested_changes",
      "file_purpose",
      sql`file_purpose = 'health_report'`,
    ),
    ck(
      "requested_changes",
      "file_target",
      sql`file_id is null or target = 'record'`,
    ),
    ck("requested_changes", "target", sql`target in ('record', 'contact')`),
    ck(
      "requested_changes",
      "shape",
      sql`(target = 'record') = (kind_descriptor_id is not null) and (target = 'contact') = (relationship_id is not null) and (record_id is null or target = 'record')`,
    ),
    ck(
      "requested_changes",
      "ciphertext",
      sql`octet_length(ciphertext) between 29 and 65565`,
    ),
    ck("requested_changes", "metadata_empty", sql`metadata = '{}'`),
    index("requested_changes_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    purposeGate("health"),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

export type DocumentKind = "rich_text" | "page" | "lesson" | "transcript";

export const documents = core.table.withRLS(
  "documents",
  {
    ...tenantColumns(),
    hostType: text("host_type").notNull(),
    hostId: uuid("host_id").notNull(),
    orgId: uuid("org_id"),
    kind: text("kind").$type<DocumentKind>().notNull(),
    schemaVersion: smallint("schema_version").notNull(),
    locale: text("locale").$type<"ar" | "en">(),
    translationOfId: uuid("translation_of_id"),
    collaborative: boolean("collaborative").notNull().default(false),
    ydoc: bytea("ydoc"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    plainText: text("plain_text").notNull().default(""),
    frozenAt: instant("frozen_at"),
    lastEditedByUserId: uuid("last_edited_by_user_id"),
    lastEditedAt: instant("last_edited_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("documents", t.tenantId, t.id),
    ...baseConstraints("documents", t, tenants),
    fk("documents", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("documents", [t.tenantId, t.translationOfId], [t.tenantId, t.id]),
    fk(
      "documents",
      [t.tenantId, t.lastEditedByUserId],
      [users.tenantId, users.id],
    ),
    ck("documents", "host_type", sql`host_type ~ '^[a-z][a-z0-9_]{1,62}$'`),
    ck(
      "documents",
      "kind",
      sql`kind in ('rich_text', 'page', 'lesson', 'transcript')`,
    ),
    ck("documents", "schema_version", sql`schema_version > 0`),
    ck("documents", "locale", sql`locale in ('ar', 'en')`),
    ck("documents", "ydoc", sql`octet_length(ydoc) <= 8388608`),
    ck("documents", "content", sql`jsonb_typeof(content) = 'object'`),
    ck("documents", "collab", sql`collaborative or ydoc is null`),
    ck("documents", "frozen", sql`frozen_at is null or not collaborative`),
    ck(
      "documents",
      "translation",
      sql`translation_of_id is null or locale is not null`,
    ),
    index("documents_host_idx").on(t.tenantId, t.hostType, t.hostId),
    index("documents_translation_idx")
      .on(t.tenantId, t.translationOfId)
      .where(sql`translation_of_id is not null`),
    ...entityProfile(),
    ...erase(erasureListed("document", "id")),
    pgPolicy("p_collab_select", {
      for: "select",
      to: roles.collab,
      using: sql`collaborative`,
    }),
    pgPolicy("p_collab_update", {
      for: "update",
      to: roles.collab,
      using: sql`collaborative and frozen_at is null`,
      withCheck: sql`collaborative`,
    }),
  ],
);

/**
 * A document a school keeps to start new ones from, such as a lesson laid
 * out as read, check and reflect, a reply the office sends often, or a
 * letter the admissions office sends. Its content is the document it
 * hosts, so its pictures and files belong to it and are copied into each
 * new one. One the school was given when it was made has no owner and a
 * `builtin_key`, so it is given once.
 */
export type LibraryState = "pending" | "shared" | "declined";

export const documentTemplates = core.table.withRLS(
  "document_templates",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    ownerUserId: uuid("owner_user_id"),
    kind: text("kind")
      .$type<
        | "lesson"
        | "assignment"
        | "unit_plan"
        | "news"
        | "announcement"
        | "event"
        | "consent_form"
        | "module"
        | "message"
        | "admission_letter"
      >()
      .notNull(),
    builtinKey: text("builtin_key"),
    /**
     * A whole module kept for the library: a copy of it, archived and set
     * for no class, that each teacher using the piece copies in turn.
     */
    moduleId: uuid("module_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    subjectDescriptorId: uuid("subject_descriptor_id"),
    subjectNs: text("subject_ns")
      .notNull()
      .generatedAlwaysAs(sql`'subject'`),
    /**
     * Whether the school's library offers it: a piece waits for a reviewer
     * unless a reviewer shared it, and one declined stays its owner's.
     */
    state: text("state").$type<LibraryState>().notNull().default("shared"),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewedAt: instant("reviewed_at"),
    reviewNote: text("review_note"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_templates", t.tenantId, t.id),
    ...baseConstraints("document_templates", t, tenants),
    fk(
      "document_templates",
      [t.tenantId, t.ownerUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "document_templates",
      "kind",
      sql`kind in ('lesson', 'assignment', 'unit_plan', 'news', 'announcement', 'event', 'consent_form', 'module', 'message', 'admission_letter')`,
    ),
    ck(
      "document_templates",
      "module",
      sql`(kind = 'module') = (module_id is not null)`,
    ),
    ck(
      "document_templates",
      "title",
      sql`char_length(title) between 1 and 120`,
    ),
    ck(
      "document_templates",
      "description",
      sql`char_length(description) <= 500`,
    ),
    ck(
      "document_templates",
      "state",
      sql`state in ('pending', 'shared', 'declined')`,
    ),
    ck(
      "document_templates",
      "review_note",
      sql`review_note is null or char_length(review_note) between 1 and 500`,
    ),
    fk(
      "document_templates",
      [t.tenantId, t.subjectDescriptorId, t.subjectNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "document_templates",
      [t.tenantId, t.reviewedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "document_templates",
      "builtin",
      sql`(builtin_key is null) = (owner_user_id is not null)`,
    ),
    ck(
      "document_templates",
      "builtin_key",
      sql`builtin_key ~ '^[a-z][a-z0-9_]{1,62}$'`,
    ),
    index("document_templates_org_idx")
      .on(t.tenantId, t.orgId, t.kind)
      .where(sql`status = 'active'`),
    uniqueIndex("document_templates_builtin_key")
      .on(t.tenantId, t.orgId, t.builtinKey)
      .where(sql`builtin_key is not null`),
    ...entityProfile(),
  ],
);

/**
 * A block kept once and shown in many documents, such as a lab's safety
 * rules or how to hand work in: each document holds only a reference, so a
 * change here reaches every one. Its content is the document it hosts, so
 * its pictures and files belong to it. A teacher's own are theirs to use;
 * the school's any teacher may.
 */
export const sharedBlocks = core.table.withRLS(
  "shared_blocks",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    scope: text("scope").$type<"mine" | "school">().notNull(),
    title: text("title").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("shared_blocks", t.tenantId, t.id),
    ...baseConstraints("shared_blocks", t, tenants),
    fk("shared_blocks", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "shared_blocks",
      [t.tenantId, t.ownerUserId],
      [users.tenantId, users.id],
    ),
    ck("shared_blocks", "scope", sql`scope in ('mine', 'school')`),
    ck("shared_blocks", "title", sql`char_length(title) between 1 and 120`),
    index("shared_blocks_org_idx")
      .on(t.tenantId, t.orgId, t.scope)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const documentVersions = core.table.withRLS(
  "document_versions",
  {
    ...tenantColumns(),
    documentId: uuid("document_id").notNull(),
    documentVersion: integer("document_version").notNull(),
    reason: text("reason")
      .$type<"publish" | "checkpoint" | "before_restore" | "import">()
      .notNull(),
    label: text("label"),
    ydocSnapshot: bytea("ydoc_snapshot"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    plainText: text("plain_text").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    redactedAt: instant("redacted_at"),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_versions", t.tenantId, t.id),
    uq(
      "document_versions",
      t.tenantId,
      t.documentId,
      t.documentVersion,
      t.reason,
    ),
    fk("document_versions", [t.tenantId], [tenants.tenantId]),
    fk(
      "document_versions",
      [t.tenantId, t.documentId],
      [documents.tenantId, documents.id],
    ),
    fk(
      "document_versions",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck("document_versions", "document_version", sql`document_version > 0`),
    ck(
      "document_versions",
      "reason",
      sql`reason in ('publish', 'checkpoint', 'before_restore', 'import')`,
    ),
    ck("document_versions", "label", sql`char_length(label) between 1 and 120`),
    ck(
      "document_versions",
      "ydoc_snapshot",
      sql`octet_length(ydoc_snapshot) <= 8388608`,
    ),
    ck("document_versions", "content", sql`jsonb_typeof(content) = 'object'`),
    ck(
      "document_versions",
      "redacted",
      sql`redacted_at is null or (content = '{}' and plain_text = '' and ydoc_snapshot is null)`,
    ),
    index("document_versions_document_idx").on(
      t.tenantId,
      t.documentId,
      t.createdAt.desc(),
    ),
    ...ledgerProfile(),
    pgPolicy("p_collab_select", {
      for: "select",
      to: roles.collab,
      using: sql`exists (select 1 from core.documents d where d.tenant_id = document_versions.tenant_id and d.id = document_versions.document_id and d.collaborative and d.frozen_at is null)`,
    }),
    pgPolicy("p_collab_insert", {
      for: "insert",
      to: roles.collab,
      withCheck: sql`reason = 'checkpoint' and exists (select 1 from core.documents d where d.tenant_id = document_versions.tenant_id and d.id = document_versions.document_id and d.collaborative and d.frozen_at is null)`,
    }),
    pgPolicy("p_erase_update", {
      for: "update",
      to: roles.retention,
      using: sql`app.erasure_listed(tenant_id, 'document', document_id)`,
      withCheck: sql`redacted_at is not null`,
    }),
  ],
);

export const documentTranslations = core.table.withRLS(
  "document_translations",
  {
    ...tenantColumns(),
    documentId: uuid("document_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    targetLocale: text("target_locale").$type<"ar" | "en">().notNull(),
    origin: text("origin").$type<"machine" | "human">().notNull(),
    engine: text("engine"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    plainText: text("plain_text").notNull().default(""),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewedAt: instant("reviewed_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_translations", t.tenantId, t.id),
    ...baseConstraints("document_translations", t, tenants),
    fk(
      "document_translations",
      [t.tenantId, t.documentId],
      [documents.tenantId, documents.id],
    ),
    fk(
      "document_translations",
      [t.tenantId, t.reviewedByUserId],
      [users.tenantId, users.id],
    ),
    ck("document_translations", "source_version", sql`source_version > 0`),
    ck(
      "document_translations",
      "target_locale",
      sql`target_locale in ('ar', 'en')`,
    ),
    ck("document_translations", "origin", sql`origin in ('machine', 'human')`),
    ck(
      "document_translations",
      "engine",
      sql`char_length(engine) between 1 and 60`,
    ),
    ck(
      "document_translations",
      "content",
      sql`jsonb_typeof(content) = 'object'`,
    ),
    ck(
      "document_translations",
      "machine",
      sql`(origin = 'machine') = (engine is not null)`,
    ),
    ck(
      "document_translations",
      "review",
      sql`(reviewed_at is null) = (reviewed_by_user_id is null)`,
    ),
    uniqueIndex("document_translations_key")
      .on(t.tenantId, t.documentId, t.targetLocale)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...erase(erasureListed("document", "document_id")),
  ],
);

export const documentFiles = core.table.withRLS(
  "document_files",
  {
    ...tenantColumns(),
    documentId: uuid("document_id").notNull(),
    fileId: uuid("file_id").notNull(),
    filePurpose: text("file_purpose").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_files", t.tenantId, t.id),
    ...baseConstraints("document_files", t, tenants),
    fk(
      "document_files",
      [t.tenantId, t.documentId],
      [documents.tenantId, documents.id],
    ),
    fk(
      "document_files",
      [t.tenantId, t.fileId, t.filePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    ck(
      "document_files",
      "file_purpose",
      sql`file_purpose in ('document_media', 'attachment', 'site_media', 'message_attachment')`,
    ),
    uniqueIndex("document_files_key")
      .on(t.tenantId, t.documentId, t.fileId)
      .where(sql`status = 'active'`),
    index("document_files_file_idx")
      .on(t.tenantId, t.fileId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureListed("document", "document_id")),
  ],
);

export const documentLinks = core.table.withRLS(
  "document_links",
  {
    ...tenantColumns(),
    documentId: uuid("document_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    href: text("href"),
    lastCheckedAt: instant("last_checked_at"),
    lastCheckStatus: smallint("last_check_status"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_links", t.tenantId, t.id),
    ...baseConstraints("document_links", t, tenants),
    fk(
      "document_links",
      [t.tenantId, t.documentId],
      [documents.tenantId, documents.id],
    ),
    ck(
      "document_links",
      "target_type",
      sql`target_type ~ '^[a-z][a-z0-9_]{1,62}$'`,
    ),
    ck("document_links", "href", sql`char_length(href) between 1 and 2048`),
    ck(
      "document_links",
      "last_check_status",
      sql`last_check_status between 0 and 999`,
    ),
    ck(
      "document_links",
      "target",
      sql`(target_type = 'url') = (target_id is null) and (target_type <> 'url' or href is not null)`,
    ),
    index("document_links_document_idx")
      .on(t.tenantId, t.documentId)
      .where(sql`status = 'active'`),
    index("document_links_target_idx")
      .on(t.tenantId, t.targetType, t.targetId)
      .where(sql`status = 'active' and target_id is not null`),
    ...entityProfile(),
  ],
);

export const privacyNotices = core.table.withRLS(
  "privacy_notices",
  {
    ...tenantColumns(),
    kind: text("kind")
      .$type<
        | "privacy_notice"
        | "consent_text"
        | "directory_notice"
        | "coppa_direct_notice"
      >()
      .notNull(),
    purposeDescriptorId: uuid("purpose_descriptor_id"),
    purposeNs: text("purpose_ns")
      .notNull()
      .generatedAlwaysAs(sql`'consent_purpose'`),
    orgId: uuid("org_id"),
    locale: text("locale").$type<"ar" | "en">().notNull(),
    versionLabel: text("version_label").notNull(),
    documentId: uuid("document_id").notNull(),
    publishedAt: instant("published_at"),
    supersedesId: uuid("supersedes_id"),
    /**
     * Who checked the translation against the original, when, and a digest
     * of the original's words then, which tells whether it has changed since.
     */
    translationReviewedAt: instant("translation_reviewed_at"),
    translationReviewedByUserId: uuid("translation_reviewed_by_user_id"),
    translationSourceDigest: text("translation_source_digest"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("privacy_notices", t.tenantId, t.id),
    ...baseConstraints("privacy_notices", t, tenants),
    fk(
      "privacy_notices",
      [t.tenantId, t.purposeDescriptorId, t.purposeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk("privacy_notices", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "privacy_notices",
      [t.tenantId, t.documentId],
      [documents.tenantId, documents.id],
    ),
    fk("privacy_notices", [t.tenantId, t.supersedesId], [t.tenantId, t.id]),
    fk(
      "privacy_notices",
      [t.tenantId, t.translationReviewedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "privacy_notices",
      "kind",
      sql`kind in ('privacy_notice', 'consent_text', 'directory_notice', 'coppa_direct_notice')`,
    ),
    ck("privacy_notices", "locale", sql`locale in ('ar', 'en')`),
    ck(
      "privacy_notices",
      "version_label",
      sql`char_length(version_label) between 1 and 40`,
    ),
    ck(
      "privacy_notices",
      "purpose",
      sql`(kind = 'consent_text') = (purpose_descriptor_id is not null)`,
    ),
    ck(
      "privacy_notices",
      "translation_review",
      sql`(translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)`,
    ),
    uniqueIndex("privacy_notices_draft_key")
      .on(t.tenantId, t.orgId, t.kind, t.purposeDescriptorId)
      .where(sql`status = 'active' and published_at is null`),
    uniqueIndex("privacy_notices_version_key")
      .on(t.tenantId, t.orgId, t.kind, t.purposeDescriptorId, t.versionLabel)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const consentRecords = core.table.withRLS(
  "consent_records",
  {
    ...tenantColumns(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    subjectUserId: uuid("subject_user_id").notNull(),
    purposeDescriptorId: uuid("purpose_descriptor_id").notNull(),
    purposeNs: text("purpose_ns")
      .notNull()
      .generatedAlwaysAs(sql`'consent_purpose'`),
    decision: text("decision")
      .$type<"granted" | "refused" | "withdrawn">()
      .notNull(),
    noticeId: uuid("notice_id"),
    givenByUserId: uuid("given_by_user_id"),
    capacity: text("capacity")
      .$type<"self" | "guardian" | "school_on_behalf">()
      .notNull(),
    relationshipId: uuid("relationship_id"),
    legalBasis: text("legal_basis")
      .$type<
        | "consent"
        | "contract"
        | "legal_obligation"
        | "public_task"
        | "school_authorization"
        | "legitimate_interest"
      >()
      .notNull(),
    explicit: boolean("explicit").notNull(),
    written: boolean("written").notNull(),
    method: text("method")
      .$type<
        | "electronic"
        | "electronic_signature"
        | "paper_scanned"
        | "verbal_recorded"
        | "import"
      >()
      .notNull(),
    evidenceFileId: uuid("evidence_file_id"),
    recordedByUserId: uuid("recorded_by_user_id"),
    validDuring: daterange("valid_during").notNull(),
    subjectAgeAtDecision: smallint("subject_age_at_decision"),
    refreshDueOn: date("refresh_due_on", { mode: "string" }),
    note: text("note"),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("consent_records", t.tenantId, t.id),
    fk("consent_records", [t.tenantId], [tenants.tenantId]),
    fk(
      "consent_records",
      [t.tenantId, t.subjectUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "consent_records",
      [t.tenantId, t.purposeDescriptorId, t.purposeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "consent_records",
      [t.tenantId, t.noticeId],
      [privacyNotices.tenantId, privacyNotices.id],
    ),
    fk(
      "consent_records",
      [t.tenantId, t.givenByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "consent_records",
      [t.tenantId, t.relationshipId],
      [userRelationships.tenantId, userRelationships.id],
    ),
    fk(
      "consent_records",
      [t.tenantId, t.evidenceFileId],
      [files.tenantId, files.id],
    ),
    fk(
      "consent_records",
      [t.tenantId, t.recordedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "consent_records",
      "decision",
      sql`decision in ('granted', 'refused', 'withdrawn')`,
    ),
    ck(
      "consent_records",
      "capacity",
      sql`capacity in ('self', 'guardian', 'school_on_behalf')`,
    ),
    ck(
      "consent_records",
      "legal_basis",
      sql`legal_basis in ('consent', 'contract', 'legal_obligation', 'public_task', 'school_authorization', 'legitimate_interest')`,
    ),
    ck(
      "consent_records",
      "method",
      sql`method in ('electronic', 'electronic_signature', 'paper_scanned', 'verbal_recorded', 'import')`,
    ),
    ck(
      "consent_records",
      "subject_age_at_decision",
      sql`subject_age_at_decision between 0 and 120`,
    ),
    ck("consent_records", "note", sql`char_length(note) between 1 and 500`),
    ck(
      "consent_records",
      "guardian",
      sql`capacity <> 'guardian' or (relationship_id is not null and given_by_user_id is not null)`,
    ),
    ck(
      "consent_records",
      "self",
      sql`capacity <> 'self' or given_by_user_id = subject_user_id`,
    ),
    ck(
      "consent_records",
      "notice",
      sql`method = 'import' or decision = 'withdrawn' or notice_id is not null`,
    ),
    ck(
      "consent_records",
      "valid_during",
      sql`not isempty(valid_during) and not lower_inf(valid_during)`,
    ),
    index("consent_records_subject_idx").on(
      t.tenantId,
      t.subjectUserId,
      t.purposeDescriptorId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    ...ledgerProfile(),
  ],
);

export const erasureApprovals = core.table.withRLS(
  "erasure_approvals",
  {
    ...tenantColumns(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    // A person, or an outside contact who never had an account; keyed to
    // message_contacts NOT VALID by the custom migration, since the table
    // already holds rows.
    subjectUserId: uuid("subject_user_id"),
    subjectContactId: uuid("subject_contact_id"),
    basis: text("basis")
      .$type<
        "data_subject_request" | "retention_schedule" | "regulator_order"
      >()
      .notNull(),
    requestReference: text("request_reference"),
    approvedByUserId: uuid("approved_by_user_id").notNull(),
    secondApproverUserId: uuid("second_approver_user_id"),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("erasure_approvals", t.tenantId, t.id),
    fk("erasure_approvals", [t.tenantId], [tenants.tenantId]),
    fk(
      "erasure_approvals",
      [t.tenantId, t.subjectUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "erasure_approvals",
      [t.tenantId, t.approvedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "erasure_approvals",
      [t.tenantId, t.secondApproverUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "erasure_approvals",
      "basis",
      sql`basis in ('data_subject_request', 'retention_schedule', 'regulator_order')`,
    ),
    ck(
      "erasure_approvals",
      "request_reference",
      sql`char_length(request_reference) between 1 and 120`,
    ),
    ck(
      "erasure_approvals",
      "approvers",
      sql`second_approver_user_id is distinct from approved_by_user_id`,
    ),
    ck(
      "erasure_approvals",
      "subject",
      sql`num_nonnulls(subject_user_id, subject_contact_id) = 1`,
    ),
    index("erasure_approvals_subject_idx").on(t.tenantId, t.subjectUserId),
    index("erasure_approvals_contact_idx")
      .on(t.tenantId, t.subjectContactId)
      .where(sql`subject_contact_id is not null`),
    ...ledgerProfile(),
  ],
);

export const erasureItems = core.table.withRLS(
  "erasure_items",
  {
    tenantId: uuid("tenant_id").notNull(),
    approvalId: uuid("approval_id").notNull(),
    objectType: text("object_type")
      .$type<"file" | "document" | "message_thread" | "site_enquiry">()
      .notNull(),
    objectId: uuid("object_id").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("erasure_items", t.tenantId, t.approvalId, t.objectType, t.objectId),
    fk("erasure_items", [t.tenantId], [tenants.tenantId]),
    fk(
      "erasure_items",
      [t.tenantId, t.approvalId],
      [erasureApprovals.tenantId, erasureApprovals.id],
    ),
    ck(
      "erasure_items",
      "object_type",
      sql`object_type in ('file', 'document', 'message_thread', 'site_enquiry')`,
    ),
    index("erasure_items_object_idx").on(t.tenantId, t.objectType, t.objectId),
    ...ledgerProfile(),
  ],
);

export const legalHolds = core.table.withRLS(
  "legal_holds",
  {
    ...tenantColumns(),
    subjectUserId: uuid("subject_user_id").notNull(),
    reason: text("reason").notNull(),
    placedByUserId: uuid("placed_by_user_id").notNull(),
    releasedAt: instant("released_at"),
    releasedByUserId: uuid("released_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("legal_holds", t.tenantId, t.id),
    ...baseConstraints("legal_holds", t, tenants),
    fk(
      "legal_holds",
      [t.tenantId, t.subjectUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "legal_holds",
      [t.tenantId, t.placedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "legal_holds",
      [t.tenantId, t.releasedByUserId],
      [users.tenantId, users.id],
    ),
    ck("legal_holds", "reason", sql`char_length(reason) between 1 and 500`),
    ck(
      "legal_holds",
      "release",
      sql`(released_at is null) = (released_by_user_id is null)`,
    ),
    index("legal_holds_subject_idx")
      .on(t.tenantId, t.subjectUserId)
      .where(sql`status = 'active' and released_at is null`),
    ...entityProfile(),
  ],
);
