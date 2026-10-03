import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  bigint,
  bytea,
  index,
  integer,
  jsonb,
  pgPolicy,
  real,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureListed,
  erasureOf,
  fk,
  instant,
  isolation,
  pk,
  roles,
  tenantColumns,
  uq,
} from "./conventions";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export type FilePurpose =
  | "document_media"
  | "attachment"
  | "submission"
  | "avatar"
  | "logo"
  | "site_media"
  | "health_report"
  | "legal_document"
  | "evidence"
  | "import_source"
  | "export";

export type FileState = "initiated" | "quarantined" | "ready" | "rejected";

export interface FileDerivative {
  key: string;
  media_type: string;
  width?: number;
  height?: number;
  size: number;
}

export const tenantKeys = core.table.withRLS(
  "tenant_keys",
  {
    tenantId: uuid("tenant_id").notNull(),
    purpose: text("purpose")
      .$type<"health" | "identifiers" | "identifier_lookup" | "files">()
      .notNull(),
    keyVersion: integer("key_version").notNull(),
    kmsKeyRef: text("kms_key_ref").notNull(),
    wrappedDek: bytea("wrapped_dek").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    retiredAt: instant("retired_at"),
    destroyedAt: instant("destroyed_at"),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("tenant_keys", t.tenantId, t.purpose, t.keyVersion),
    fk("tenant_keys", [t.tenantId], [tenants.tenantId]),
    ck(
      "tenant_keys",
      "purpose",
      sql`purpose in ('health', 'identifiers', 'identifier_lookup', 'files')`,
    ),
    ck("tenant_keys", "key_version", sql`key_version > 0`),
    ck(
      "tenant_keys",
      "kms_key_ref",
      sql`char_length(kms_key_ref) between 1 and 512`,
    ),
    ck(
      "tenant_keys",
      "wrapped_dek",
      sql`octet_length(wrapped_dek) between 32 and 4096`,
    ),
    uniqueIndex("tenant_keys_active_key")
      .on(t.tenantId, t.purpose)
      .where(sql`retired_at is null`),
    ...isolation(),
    pgPolicy("p_select", {
      for: "select",
      to: [roles.app, roles.worker, roles.cellIo, roles.retention],
      using: sql`true`,
    }),
    pgPolicy("p_insert", {
      for: "insert",
      to: [roles.worker, roles.cellIo],
      withCheck: sql`true`,
    }),
    pgPolicy("p_update", {
      for: "update",
      to: [roles.worker, roles.retention],
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
);

export const files = core.table.withRLS(
  "files",
  {
    ...tenantColumns(),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    hostType: text("host_type"),
    hostId: uuid("host_id"),
    /** The school the file was uploaded in, whose storage it uses. */
    orgId: uuid("org_id"),
    purpose: text("purpose").$type<FilePurpose>().notNull(),
    name: text("name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: bytea("sha256"),
    state: text("state").$type<FileState>().notNull().default("initiated"),
    rejectionReason: text("rejection_reason"),
    storageKey: text("storage_key").notNull(),
    encryption: text("encryption")
      .$type<"bucket" | "tenant_dek">()
      .notNull()
      .default("bucket"),
    keyPurpose: text("key_purpose").generatedAlwaysAs(
      sql`case when encryption = 'tenant_dek' then 'files' end`,
    ),
    keyVersion: integer("key_version"),
    scannedAt: instant("scanned_at"),
    scanEngine: text("scan_engine"),
    readyAt: instant("ready_at"),
    linkedAt: instant("linked_at"),
    /** Deleted from a class's or module's file area; restorable until the sweep retires it. */
    trashedAt: instant("trashed_at"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    derivatives: jsonb("derivatives")
      .$type<Record<string, FileDerivative>>()
      .notNull()
      .default(sql`'{}'`),
    /**
     * A video's adaptive streams, made by the media service: queued once the
     * upload is ready, encoding while a worker holds its lease, then ready as
     * derivatives, or failed after its last attempt.
     */
    streamState: text("stream_state").$type<
      "queued" | "encoding" | "ready" | "failed"
    >(),
    streamAttempts: integer("stream_attempts").notNull().default(0),
    streamLeasedUntil: instant("stream_leased_until"),
    streamProgress: real("stream_progress"),
    streamError: text("stream_error"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("files", t.tenantId, t.id),
    uq("files", t.tenantId, t.id, t.purpose),
    ...baseConstraints("files", t, tenants),
    fk(
      "files",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    fk("files", [t.tenantId, t.uploadedByUserId], [users.tenantId, users.id]),
    fk("files", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("files", "host_type", sql`host_type ~ '^[a-z][a-z0-9_]{1,62}$'`),
    ck(
      "files",
      "purpose",
      sql`purpose in ('document_media', 'attachment', 'submission', 'avatar', 'logo', 'site_media', 'health_report', 'legal_document', 'evidence', 'import_source', 'export')`,
    ),
    ck("files", "name", sql`char_length(name) between 1 and 255`),
    ck("files", "media_type", sql`char_length(media_type) between 3 and 128`),
    ck("files", "size_bytes", sql`size_bytes > 0`),
    ck("files", "sha256", sql`octet_length(sha256) = 32`),
    ck(
      "files",
      "state",
      sql`state in ('initiated', 'quarantined', 'ready', 'rejected')`,
    ),
    ck(
      "files",
      "rejection_reason",
      sql`rejection_reason in ('too_large', 'size_mismatch', 'content_mismatch', 'infected', 'scan_unavailable', 'abandoned')`,
    ),
    ck("files", "storage_key", sql`char_length(storage_key) between 1 and 512`),
    ck("files", "encryption", sql`encryption in ('bucket', 'tenant_dek')`),
    ck("files", "scan_engine", sql`char_length(scan_engine) between 1 and 60`),
    ck("files", "width", sql`width > 0`),
    ck("files", "height", sql`height > 0`),
    ck("files", "duration_ms", sql`duration_ms > 0`),
    ck("files", "derivatives", sql`jsonb_typeof(derivatives) = 'object'`),
    ck(
      "files",
      "stream_state",
      sql`stream_state in ('queued', 'encoding', 'ready', 'failed')`,
    ),
    ck("files", "stream_attempts", sql`stream_attempts between 0 and 10`),
    ck("files", "stream_progress", sql`stream_progress between 0 and 1`),
    ck("files", "stream_error", sql`char_length(stream_error) <= 2000`),
    ck(
      "files",
      "stream_lease",
      sql`(stream_state = 'encoding') = (stream_leased_until is not null)`,
    ),
    ck("files", "host_pair", sql`(host_type is null) = (host_id is null)`),
    ck(
      "files",
      "rejection",
      sql`(state = 'rejected') = (rejection_reason is not null)`,
    ),
    ck(
      "files",
      "ready",
      sql`state <> 'ready' or (sha256 is not null and ready_at is not null)`,
    ),
    ck(
      "files",
      "key",
      sql`(encryption = 'tenant_dek') = (key_version is not null)`,
    ),
    ck(
      "files",
      "storage_prefix",
      sql`starts_with(storage_key, 't/' || tenant_id::text || '/')`,
    ),
    ck(
      "files",
      "derivatives_prefix",
      sql`not jsonb_path_exists(derivatives, '$.*.key ? (!(@ starts with $p))', jsonb_build_object('p', 't/' || tenant_id::text || '/'))`,
    ),
    ck(
      "files",
      "health_report",
      sql`purpose <> 'health_report' or (derivatives = '{}' and name ~ '^medical-report(\\.[a-z0-9]{1,8})?$' and (state <> 'ready' or encryption = 'tenant_dek'))`,
    ),
    index("files_host_idx")
      .on(t.tenantId, t.hostType, t.hostId)
      .where(sql`status = 'active'`),
    index("files_state_idx")
      .on(t.tenantId, t.state, t.createdAt)
      .where(sql`status = 'active'`),
    index("files_storage_key_idx").on(t.tenantId, t.storageKey),
    index("files_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    index("files_stream_queue_idx")
      .on(t.tenantId, t.readyAt)
      .where(sql`status = 'active' and stream_state in ('queued', 'encoding')`),
    index("files_trashed_idx")
      .on(t.tenantId, t.trashedAt)
      .where(sql`status = 'active' and trashed_at is not null`),
    ...entityProfile(),
    ...eraseAndDelete(erasureListed("file", "id")),
    pgPolicy("files_purpose_gate", {
      as: "restrictive",
      for: "all",
      to: "public",
      using: sql`purpose not in ('health_report', 'evidence', 'legal_document') or (select current_setting('app.purpose', true)) = case purpose when 'health_report' then 'health' else 'custody' end`,
      withCheck: sql`purpose not in ('health_report', 'evidence', 'legal_document') or (select current_setting('app.purpose', true)) = case purpose when 'health_report' then 'health' else 'custody' end`,
    }),
  ],
);

export const filePublications = core.table.withRLS(
  "file_publications",
  {
    ...tenantColumns(),
    fileId: uuid("file_id").notNull(),
    filePurpose: text("file_purpose").$type<FilePurpose>().notNull(),
    derivative: text("derivative"),
    publicKey: text("public_key").notNull(),
    hostType: text("host_type").notNull(),
    hostId: uuid("host_id").notNull(),
    publishedAt: instant("published_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    unpublishedAt: instant("unpublished_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("file_publications", t.tenantId, t.id),
    uq("file_publications", t.tenantId, t.publicKey),
    ...baseConstraints("file_publications", t, tenants),
    fk(
      "file_publications",
      [t.tenantId, t.fileId, t.filePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    ck(
      "file_publications",
      "file_purpose",
      sql`file_purpose in ('site_media', 'logo', 'document_media')`,
    ),
    ck(
      "file_publications",
      "derivative",
      sql`derivative ~ '^[a-z0-9_]{1,40}$'`,
    ),
    ck(
      "file_publications",
      "public_key",
      sql`public_key ~ '^p/[a-z0-9]{26}/[A-Za-z0-9._-]{1,120}$'`,
    ),
    ck(
      "file_publications",
      "host_type",
      sql`host_type ~ '^[a-z][a-z0-9_]{1,62}$'`,
    ),
    index("file_publications_file_idx")
      .on(t.tenantId, t.fileId)
      .where(sql`status = 'active' and unpublished_at is null`),
    index("file_publications_host_idx")
      .on(t.tenantId, t.hostType, t.hostId)
      .where(sql`status = 'active' and unpublished_at is null`),
    ...entityProfile(),
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active' and unpublished_at is null`,
    }),
  ],
);

export const fileSubjects = core.table.withRLS(
  "file_subjects",
  {
    ...tenantColumns(),
    fileId: uuid("file_id").notNull(),
    userId: uuid("user_id").notNull(),
    taggedByUserId: uuid("tagged_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("file_subjects", t.tenantId, t.id),
    ...baseConstraints("file_subjects", t, tenants),
    fk("file_subjects", [t.tenantId, t.fileId], [files.tenantId, files.id]),
    fk("file_subjects", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "file_subjects",
      [t.tenantId, t.taggedByUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("file_subjects_key")
      .on(t.tenantId, t.fileId, t.userId)
      .where(sql`status = 'active'`),
    index("file_subjects_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("user_id")),
  ],
);

export type LocationKind =
  | "room"
  | "lab"
  | "hall"
  | "library"
  | "sports"
  | "outdoor"
  | "building"
  | "external"
  | "other";

export const locations = core.table.withRLS(
  "locations",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    parentLocationId: uuid("parent_location_id"),
    kind: text("kind").$type<LocationKind>().notNull().default("room"),
    code: text("code"),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    capacity: integer("capacity"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("locations", t.tenantId, t.id),
    ...baseConstraints("locations", t, tenants),
    fk(
      "locations",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk("locations", [t.tenantId, t.parentLocationId], [t.tenantId, t.id]),
    ck("locations", "org_type", sql`org_type = 'school'`),
    ck(
      "locations",
      "kind",
      sql`kind in ('room', 'lab', 'hall', 'library', 'sports', 'outdoor', 'building', 'external', 'other')`,
    ),
    ck("locations", "code", sql`char_length(code) between 1 and 32`),
    ck("locations", "name_en", sql`char_length(name_en) between 1 and 80`),
    ck("locations", "name_ar", sql`char_length(name_ar) between 1 and 80`),
    ck("locations", "capacity", sql`capacity > 0`),
    ck("locations", "name", sql`num_nonnulls(name_en, name_ar) >= 1`),
    uniqueIndex("locations_code_key")
      .on(t.tenantId, t.orgId, t.code)
      .where(sql`status = 'active' and code is not null`),
    ...entityProfile(),
  ],
);
