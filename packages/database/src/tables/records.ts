import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytea,
  index,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  audit,
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  ledgerProfile,
  ops,
  pk,
  roles,
  tenantColumns,
} from "./conventions";
import { files } from "./files";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export const importRuns = core.table.withRLS(
  "import_runs",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    kind: text("kind").notNull(),
    mode: text("mode").$type<"create" | "create_or_update">().notNull(),
    sourceFileId: uuid("source_file_id").notNull(),
    sourceFilePurpose: text("source_file_purpose")
      .notNull()
      .default("import_source"),
    mapping: jsonb("mapping")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    state: text("state")
      .$type<
        | "uploaded"
        | "validated"
        | "committing"
        | "committed"
        | "failed"
        | "cancelled"
        | "undone"
      >()
      .notNull()
      .default("uploaded"),
    rowCount: integer("row_count"),
    createdCount: integer("created_count"),
    updatedCount: integer("updated_count"),
    skippedCount: integer("skipped_count"),
    errorCount: integer("error_count"),
    startedByUserId: uuid("started_by_user_id").notNull(),
    committedAt: instant("committed_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("import_runs", t.tenantId, t.id),
    ...baseConstraints("import_runs", t, tenants),
    fk("import_runs", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "import_runs",
      [t.tenantId, t.sourceFileId, t.sourceFilePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    fk(
      "import_runs",
      [t.tenantId, t.startedByUserId],
      [users.tenantId, users.id],
    ),
    ck("import_runs", "kind", sql`kind ~ '^[a-z][a-z0-9_]{1,40}$'`),
    ck("import_runs", "mode", sql`mode in ('create', 'create_or_update')`),
    ck(
      "import_runs",
      "source_file_purpose",
      sql`source_file_purpose = 'import_source'`,
    ),
    ck(
      "import_runs",
      "mapping",
      sql`jsonb_typeof(mapping) = 'object' and octet_length(mapping::text) <= 16384`,
    ),
    ck(
      "import_runs",
      "state",
      sql`state in ('uploaded', 'validated', 'committing', 'committed', 'failed', 'cancelled', 'undone')`,
    ),
    ck("import_runs", "row_count", sql`row_count >= 0`),
    ck("import_runs", "created_count", sql`created_count >= 0`),
    ck("import_runs", "updated_count", sql`updated_count >= 0`),
    ck("import_runs", "skipped_count", sql`skipped_count >= 0`),
    ck("import_runs", "error_count", sql`error_count >= 0`),
    ...entityProfile(),
  ],
);

export const importRows = core.table.withRLS(
  "import_rows",
  {
    tenantId: uuid("tenant_id").notNull(),
    importRunId: uuid("import_run_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    outcome: text("outcome")
      .$type<"created" | "updated" | "skipped" | "error">()
      .notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    errorCodes: text("error_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("import_rows", t.tenantId, t.importRunId, t.rowNumber),
    fk("import_rows", [t.tenantId], [tenants.tenantId]),
    fk(
      "import_rows",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck("import_rows", "row_number", sql`row_number > 0`),
    ck(
      "import_rows",
      "outcome",
      sql`outcome in ('created', 'updated', 'skipped', 'error')`,
    ),
    ck(
      "import_rows",
      "target_type",
      sql`target_type ~ '^[a-z][a-z0-9_]{1,62}$'`,
    ),
    ...ledgerProfile(),
  ],
);

export const userPreferences = core.table.withRLS(
  "user_preferences",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("user_preferences", t.tenantId, t.id),
    ...baseConstraints("user_preferences", t, tenants),
    fk("user_preferences", [t.tenantId, t.userId], [users.tenantId, users.id]),
    ck("user_preferences", "key", sql`key ~ '^[a-z][a-z0-9_.]{1,79}$'`),
    ck("user_preferences", "value", sql`octet_length(value::text) <= 8192`),
    uniqueIndex("user_preferences_key")
      .on(t.tenantId, t.userId, t.key)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("user_id")),
  ],
);

export const savedViews = core.table.withRLS(
  "saved_views",
  {
    ...tenantColumns(),
    ownerUserId: uuid("owner_user_id").notNull(),
    orgId: uuid("org_id"),
    surface: text("surface").notNull(),
    name: text("name").notNull(),
    filter: jsonb("filter").$type<Record<string, unknown>>().notNull(),
    shared: boolean("shared").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("saved_views", t.tenantId, t.id),
    ...baseConstraints("saved_views", t, tenants),
    fk("saved_views", [t.tenantId, t.ownerUserId], [users.tenantId, users.id]),
    fk("saved_views", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("saved_views", "surface", sql`surface ~ '^[a-z][a-z0-9_.]{1,79}$'`),
    ck("saved_views", "name", sql`char_length(name) between 1 and 80`),
    ck(
      "saved_views",
      "filter",
      sql`jsonb_typeof(filter) = 'object' and octet_length(filter::text) <= 8192`,
    ),
    index("saved_views_owner_idx")
      .on(t.tenantId, t.ownerUserId, t.surface)
      .where(sql`status = 'active'`),
    index("saved_views_shared_idx")
      .on(t.tenantId, t.orgId, t.surface)
      .where(sql`status = 'active' and shared`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("owner_user_id")),
  ],
);

const sealerInsert = [roles.worker, roles.cellIo];

export const sealBatches = audit.table.withRLS(
  "seal_batches",
  {
    tenantId: uuid("tenant_id").notNull(),
    batchNo: bigint("batch_no", { mode: "number" }).notNull(),
    sealedAt: instant("sealed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    eventCount: integer("event_count").notNull(),
    root: bytea("root").notNull(),
    prevHash: bytea("prev_hash"),
    hash: bytea("hash").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("seal_batches", t.tenantId, t.batchNo),
    fk("seal_batches", [t.tenantId], [tenants.tenantId]),
    ck("seal_batches", "batch_no", sql`batch_no > 0`),
    ck("seal_batches", "event_count", sql`event_count >= 0`),
    ck("seal_batches", "root", sql`octet_length(root) = 32`),
    ck("seal_batches", "prev_hash", sql`octet_length(prev_hash) = 32`),
    ck("seal_batches", "hash", sql`octet_length(hash) = 32`),
    ck("seal_batches", "chain", sql`(batch_no = 1) = (prev_hash is null)`),
    ...ledgerProfile({ insert: sealerInsert }),
  ],
);

export const sealMembers = audit.table.withRLS(
  "seal_members",
  {
    tenantId: uuid("tenant_id").notNull(),
    eventId: uuid("event_id").notNull(),
    eventOccurredAt: instant("event_occurred_at").notNull(),
    batchNo: bigint("batch_no", { mode: "number" }).notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("seal_members", t.tenantId, t.eventId),
    fk(
      "seal_members",
      [t.tenantId, t.batchNo],
      [sealBatches.tenantId, sealBatches.batchNo],
    ),
    index("seal_members_batch_idx").on(t.tenantId, t.batchNo),
    ...ledgerProfile({ insert: sealerInsert }),
  ],
);

export const anchors = audit.table.withRLS(
  "anchors",
  {
    tenantId: uuid("tenant_id").notNull(),
    batchNo: bigint("batch_no", { mode: "number" }).notNull(),
    anchoredAt: instant("anchored_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    objectKey: text("object_key").notNull(),
    objectVersionId: text("object_version_id").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("anchors", t.tenantId, t.batchNo),
    fk(
      "anchors",
      [t.tenantId, t.batchNo],
      [sealBatches.tenantId, sealBatches.batchNo],
    ),
    ck(
      "anchors",
      "object_key",
      sql`char_length(object_key) between 1 and 1024`,
    ),
    ck(
      "anchors",
      "object_version_id",
      sql`char_length(object_version_id) between 1 and 1024`,
    ),
    ...ledgerProfile({ insert: sealerInsert }),
  ],
);

export type TenantLifecycle =
  | "provisioning"
  | "importing"
  | "active"
  | "read_only"
  | "frozen"
  | "suspended"
  | "offboarding";

export const tenantRegistry = ops.table(
  "tenant_registry",
  {
    tenantId: uuid("tenant_id").primaryKey(),
    lifecycle: text("lifecycle").$type<TenantLifecycle>().notNull(),
    changedAt: instant("changed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (): PgTableExtraConfigValue[] => [
    ck(
      "tenant_registry",
      "lifecycle",
      sql`lifecycle in ('provisioning', 'importing', 'active', 'read_only', 'frozen', 'suspended', 'offboarding')`,
    ),
  ],
);

export const smsSuppressions = ops.table(
  "sms_suppressions",
  {
    addressHmac: bytea("address_hmac").notNull(),
    senderId: text("sender_id").notNull(),
    suppressedAt: instant("suppressed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("sms_suppressions", t.addressHmac, t.senderId),
    ck(
      "sms_suppressions",
      "address_hmac",
      sql`octet_length(address_hmac) = 32`,
    ),
    ck(
      "sms_suppressions",
      "sender_id",
      sql`char_length(sender_id) between 1 and 40`,
    ),
  ],
);

export const partitionedTables = ops.table(
  "partitioned_tables",
  {
    schemaName: text("schema_name").notNull(),
    tableName: text("table_name").notNull(),
    period: text("period").$type<"month" | "year">().notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("partitioned_tables", t.schemaName, t.tableName),
    ck("partitioned_tables", "period", sql`period in ('month', 'year')`),
  ],
);
