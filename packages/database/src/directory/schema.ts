import type { ExamBoard } from "@faridalms/domain/exams";

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () =>
  instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`);

export type CellState = "provisioning" | "open" | "closed" | "draining";
export type DirectoryTenantState =
  | "provisioning"
  | "importing"
  | "active"
  | "frozen"
  | "suspended"
  | "offboarding"
  | "offboarded";

export const cells = pgTable(
  "cells",
  {
    id: text("id").primaryKey(),
    jurisdiction: text("jurisdiction").notNull(),
    provider: text("provider").notNull(),
    region: text("region").notNull(),
    appHost: text("app_host").notNull().unique("cells_app_host_key"),
    apiBaseUrl: text("api_base_url").notNull(),
    state: text("state").$type<CellState>().notNull().default("provisioning"),
    createdAt: createdAt(),
  },
  () => [
    check("cells_id_check", sql`id ~ '^[a-z]{2}-[0-9]{1,2}$'`),
    check("cells_jurisdiction_check", sql`jurisdiction ~ '^[A-Z]{2}$'`),
    check("cells_provider_check", sql`char_length(provider) between 1 and 40`),
    check("cells_region_check", sql`char_length(region) between 1 and 60`),
    check("cells_app_host_check", sql`app_host = lower(app_host)`),
    check(
      "cells_api_base_url_check",
      sql`char_length(api_base_url) between 1 and 2048`,
    ),
    check(
      "cells_state_check",
      sql`state in ('provisioning', 'open', 'closed', 'draining')`,
    ),
  ],
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<"school_group" | "school">().notNull(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    cellId: text("cell_id").notNull(),
    jurisdictions: text("jurisdictions").array().notNull(),
    state: text("state")
      .$type<DirectoryTenantState>()
      .notNull()
      .default("provisioning"),
    mergedIntoId: uuid("merged_into_id"),
    createdAt: createdAt(),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: "tenants_cell_id_fkey",
      columns: [t.cellId],
      foreignColumns: [cells.id],
    }),
    foreignKey({
      name: "tenants_merged_into_id_fkey",
      columns: [t.mergedIntoId],
      foreignColumns: [t.id],
    }),
    check("tenants_kind_check", sql`kind in ('school_group', 'school')`),
    check("tenants_name_en_check", sql`char_length(name_en) between 1 and 160`),
    check("tenants_name_ar_check", sql`char_length(name_ar) between 1 and 160`),
    check(
      "tenants_jurisdictions_check",
      sql`array_to_string(jurisdictions, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'`,
    ),
    check(
      "tenants_state_check",
      sql`state in ('provisioning', 'importing', 'active', 'frozen', 'suspended', 'offboarding', 'offboarded')`,
    ),
    check("tenants_check", sql`num_nonnulls(name_en, name_ar) >= 1`),
    check(
      "tenants_check1",
      sql`merged_into_id is null or state = 'offboarded'`,
    ),
  ],
);

export const schools = pgTable(
  "schools",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    slug: text("slug").notNull().unique("schools_slug_key"),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    placement: text("placement").$type<"legacy" | "cell">().notNull(),
    legacySchoolId: uuid("legacy_school_id").unique(
      "schools_legacy_school_id_key",
    ),
    listed: boolean("listed").notNull().default(true),
    movedAt: instant("moved_at"),
    createdAt: createdAt(),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: "schools_tenant_id_fkey",
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }),
    check(
      "schools_slug_check",
      sql`slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'`,
    ),
    check("schools_name_en_check", sql`char_length(name_en) between 1 and 160`),
    check("schools_name_ar_check", sql`char_length(name_ar) between 1 and 160`),
    check("schools_placement_check", sql`placement in ('legacy', 'cell')`),
    check("schools_check", sql`num_nonnulls(name_en, name_ar) >= 1`),
    check(
      "schools_check1",
      sql`placement = 'cell' or legacy_school_id is not null`,
    ),
    index("schools_tenant_idx").on(t.tenantId),
  ],
);

export const hosts = pgTable(
  "hosts",
  {
    hostname: text("hostname").primaryKey(),
    schoolId: uuid("school_id").notNull(),
    verifiedAt: instant("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "hosts_school_id_fkey",
      columns: [t.schoolId],
      foreignColumns: [schools.id],
    }),
    check(
      "hosts_hostname_check",
      sql`hostname = lower(hostname) and char_length(hostname) between 3 and 253`,
    ),
  ],
);

export const ssoDomains = pgTable(
  "sso_domains",
  {
    domain: text("domain").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    verificationMethod: text("verification_method")
      .$type<"dns_txt" | "idp_hosted_domain">()
      .notNull(),
    verifiedAt: instant("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "sso_domains_tenant_id_fkey",
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }),
    check(
      "sso_domains_domain_check",
      sql`domain = lower(domain) and char_length(domain) between 3 and 253`,
    ),
    check(
      "sso_domains_verification_method_check",
      sql`verification_method in ('dns_txt', 'idp_hosted_domain')`,
    ),
  ],
);

export const integrationClients = pgTable(
  "integration_clients",
  {
    clientId: text("client_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").$type<"oneroster" | "lti">().notNull(),
    createdAt: createdAt(),
    revokedAt: instant("revoked_at"),
  },
  (t) => [
    foreignKey({
      name: "integration_clients_tenant_id_fkey",
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }),
    check(
      "integration_clients_client_id_check",
      sql`client_id ~ '^[A-Za-z0-9_-]{16,64}$'`,
    ),
    check("integration_clients_kind_check", sql`kind in ('oneroster', 'lti')`),
    index("integration_clients_tenant_idx").on(t.tenantId),
  ],
);

/**
 * What a school's plan allows: storage for the school and caps for each
 * class, module and person, and which modules it may use. A missing row or
 * a null means the platform's default.
 */
export const schoolPlans = pgTable(
  "school_plans",
  {
    schoolId: uuid("school_id").primaryKey(),
    poolBytes: bigint("pool_bytes", { mode: "number" }),
    classBytes: bigint("class_bytes", { mode: "number" }),
    moduleBytes: bigint("module_bytes", { mode: "number" }),
    personBytes: bigint("person_bytes", { mode: "number" }),
    modules: text("modules").array(),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: "school_plans_school_id_fkey",
      columns: [t.schoolId],
      foreignColumns: [schools.id],
    }),
    check("school_plans_pool_bytes_check", sql`pool_bytes > 0`),
    check("school_plans_class_bytes_check", sql`class_bytes > 0`),
    check("school_plans_module_bytes_check", sql`module_bytes > 0`),
    check("school_plans_person_bytes_check", sql`person_bytes > 0`),
    check(
      "school_plans_modules_check",
      sql`modules <@ array['elearning', 'early_years', 'video', 'coding']::text[]`,
    ),
  ],
);

/** How much storage a school uses, as its cell last measured. */
export const schoolUsage = pgTable(
  "school_usage",
  {
    schoolId: uuid("school_id").primaryKey(),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull(),
    fileCount: integer("file_count").notNull(),
    measuredAt: instant("measured_at").notNull(),
  },
  (t) => [
    foreignKey({
      name: "school_usage_school_id_fkey",
      columns: [t.schoolId],
      foreignColumns: [schools.id],
    }),
    check("school_usage_used_bytes_check", sql`used_bytes >= 0`),
    check("school_usage_file_count_check", sql`file_count >= 0`),
  ],
);

/**
 * An exam board's session, such as Cambridge June 2027, and the date
 * coursework submitted for it must be kept until: after the board's
 * results enquiries and appeals close. Operators keep the official dates
 * current; a school may keep its work longer.
 */
export const examSeries = pgTable(
  "exam_series",
  {
    id: text("id").primaryKey(),
    board: text("board").$type<ExamBoard>().notNull(),
    /** The first day of the month the session sits in, which names it. */
    sitsIn: date("sits_in", { mode: "string" }).notNull(),
    keepUntil: date("keep_until", { mode: "string" }).notNull(),
    retired: boolean("retired").notNull().default(false),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t) => [
    check("exam_series_id_check", sql`id ~ '^[a-z0-9][a-z0-9-]{2,62}$'`),
    check(
      "exam_series_board_check",
      sql`board in ('cambridge', 'pearson', 'ib', 'jcq')`,
    ),
    check("exam_series_sits_in_check", sql`extract(day from sits_in) = 1`),
    check("exam_series_keep_until_check", sql`keep_until > sits_in`),
    uniqueIndex("exam_series_board_sits_in_key").on(t.board, t.sitsIn),
  ],
);

export const changes = pgTable(
  "changes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    occurredAt: instant("occurred_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    actor: text("actor").notNull(),
    subjectType: text("subject_type")
      .$type<
        | "cell"
        | "tenant"
        | "school"
        | "host"
        | "sso_domain"
        | "integration_client"
        | "exam_series"
      >()
      .notNull(),
    subjectId: text("subject_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason").notNull(),
  },
  () => [
    check(
      "changes_actor_check",
      sql`actor ~ '^(operator|cell):[A-Za-z0-9_-]{1,64}$'`,
    ),
    check(
      "changes_subject_type_check",
      sql`subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain', 'integration_client', 'exam_series')`,
    ),
    check("changes_action_check", sql`char_length(action) between 1 and 60`),
    check("changes_reason_check", sql`char_length(reason) between 1 and 500`),
  ],
);
