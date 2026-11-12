import type { HostRole, HostState } from "@faridalms/domain/hosts";
import type { OnboardingItem } from "@faridalms/domain/onboarding";
import type { SchoolAccess, SchoolNotice } from "@faridalms/domain/plans";

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytea,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  | "read_only"
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
      sql`state in ('provisioning', 'importing', 'active', 'read_only', 'frozen', 'suspended', 'offboarding', 'offboarded')`,
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

/**
 * A school's own hostname, for its public website or its portal. It routes
 * only once the school has proved it holds the name in DNS; a removed host
 * stays as a tombstone so its name cannot quietly pass to another school.
 */
export const hosts = pgTable(
  "hosts",
  {
    hostname: text("hostname").primaryKey(),
    schoolId: uuid("school_id").notNull(),
    role: text("role").$type<HostRole>().notNull(),
    /** The address links and redirects use for the school's role, once active. */
    canonical: boolean("canonical").notNull().default(false),
    /** What the school publishes in TXT `_farida-challenge.<hostname>`. */
    challenge: text("challenge").notNull(),
    state: text("state").$type<HostState>().notNull().default("pending"),
    stateChangedAt: instant("state_changed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    verifiedAt: instant("verified_at"),
    /** Null when a check is due now. */
    checkedAt: instant("checked_at"),
    lastError: text("last_error"),
    /** Rechecks in a row that did not find the records. */
    failures: integer("failures").notNull().default(0),
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
    check("hosts_role_check", sql`role in ('site', 'portal')`),
    check(
      "hosts_state_check",
      sql`state in ('pending', 'verified', 'active', 'failing', 'removed')`,
    ),
    check("hosts_challenge_check", sql`challenge ~ '^[A-Za-z0-9_-]{32,64}$'`),
    check("hosts_failures_check", sql`failures >= 0`),
    check(
      "hosts_last_error_check",
      sql`char_length(last_error) between 1 and 200`,
    ),
    check("hosts_check", sql`not canonical or state <> 'removed'`),
    uniqueIndex("hosts_canonical_key")
      .on(t.schoolId, t.role)
      .where(sql`canonical`),
    index("hosts_school_idx").on(t.schoolId),
    index("hosts_due_idx")
      .on(t.checkedAt)
      .where(sql`state <> 'removed'`),
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
      // The registry's ids, written out because a check is fixed DDL;
      // a test saves a plan naming every module in packages/domain/src/modules.ts.
      sql`modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[]`,
    ),
  ],
);

/**
 * What a school is entitled to, as the operator console publishes it: its
 * modules, its storage, its other limits (null where unlimited), how far it
 * may use the platform, and a notice for its administrators. A school with
 * no row has Basic. No price, name or contact is kept here.
 */
export const schoolEntitlements = pgTable(
  "school_entitlements",
  {
    schoolId: uuid("school_id").primaryKey(),
    modules: text("modules").array().notNull(),
    poolBytes: bigint("pool_bytes", { mode: "number" }).notNull(),
    classBytes: bigint("class_bytes", { mode: "number" }).notNull(),
    moduleBytes: bigint("module_bytes", { mode: "number" }).notNull(),
    personBytes: bigint("person_bytes", { mode: "number" }).notNull(),
    students: integer("students"),
    staffAccounts: integer("staff_accounts"),
    videoHours: integer("video_hours"),
    customDomains: integer("custom_domains"),
    emailPerMonth: integer("email_per_month"),
    captionMinutes: integer("caption_minutes"),
    access: text("access").$type<SchoolAccess>().notNull().default("full"),
    trialEndsOn: date("trial_ends_on", { mode: "string" }),
    notice: text("notice").$type<SchoolNotice>(),
    revision: integer("revision").notNull().default(1),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: "school_entitlements_school_id_fkey",
      columns: [t.schoolId],
      foreignColumns: [schools.id],
    }),
    check(
      "school_entitlements_modules_check",
      // The registry's ids, written out because a check is fixed DDL;
      // a test saves entitlements naming every module in packages/domain/src/modules.ts.
      sql`modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[]`,
    ),
    check(
      "school_entitlements_bytes_check",
      sql`pool_bytes > 0 and class_bytes > 0 and module_bytes > 0 and person_bytes > 0`,
    ),
    check(
      "school_entitlements_limits_check",
      sql`coalesce(students, 0) >= 0 and coalesce(staff_accounts, 0) >= 0
        and coalesce(video_hours, 0) >= 0 and coalesce(custom_domains, 0) >= 0
        and coalesce(email_per_month, 0) >= 0 and coalesce(caption_minutes, 0) >= 0`,
    ),
    check(
      "school_entitlements_access_check",
      sql`access in ('full', 'restricted', 'read_only')`,
    ),
    check(
      "school_entitlements_notice_check",
      sql`notice in ('payment_overdue', 'plan_ends_soon')`,
    ),
    check("school_entitlements_revision_check", sql`revision > 0`),
  ],
);

/**
 * Which tenants hold a sign-in name, for sign-in on the bare portal domain,
 * where the person names no school. The key is an HMAC of the name under a
 * platform secret the directory never holds, so the directory keeps no
 * personal data: without the secret a row names nobody, and a name can be
 * tested only by a holder of the secret. Each cell keeps its tenants' rows
 * current through directory_sync.
 */
export const loginIndex = pgTable(
  "login_index",
  {
    key: bytea("key").notNull(),
    tenantId: uuid("tenant_id").notNull(),
  },
  (t) => [
    primaryKey({ name: "login_index_pkey", columns: [t.key, t.tenantId] }),
    foreignKey({
      name: "login_index_tenant_id_fkey",
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete("cascade"),
    index("login_index_tenant_idx").on(t.tenantId),
    check("login_index_key_check", sql`octet_length(key) = 32`),
  ],
);

/** How much storage a school uses, as its cell last measured. */
export const schoolUsage = pgTable(
  "school_usage",
  {
    schoolId: uuid("school_id").primaryKey(),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull(),
    fileCount: integer("file_count").notNull(),
    /** Students with a placement on the day it was measured. */
    students: integer("students").notNull().default(0),
    staffAccounts: integer("staff_accounts").notNull().default(0),
    signedIn7d: integer("signed_in_7d").notNull().default(0),
    signedIn30d: integer("signed_in_30d").notNull().default(0),
    /** Streamed video kept, which video hours are held to. */
    videoMinutes: integer("video_minutes").notNull().default(0),
    /** Emails sent this month of the school's calendar, which the monthly limit is held to. */
    emailsThisMonth: integer("emails_this_month").notNull().default(0),
    /** School days in the last week by its own calendar, so a quiet holiday is told from a quiet term. */
    schoolDays7d: integer("school_days_7d").notNull().default(0),
    /** Messages to its people that could not be delivered in the last day. */
    failedDeliveries1d: integer("failed_deliveries_1d").notNull().default(0),
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
    check(
      "school_usage_counts_check",
      sql`students >= 0 and staff_accounts >= 0 and signed_in_7d >= 0 and signed_in_30d >= 0 and video_minutes >= 0 and emails_this_month >= 0 and school_days_7d between 0 and 7 and failed_deliveries_1d >= 0`,
    ),
  ],
);

/**
 * What a school sent and who signed in, one row a day of the school's own
 * calendar, for billing, health and reports. Counts, never people.
 */
export const schoolUsageDaily = pgTable(
  "school_usage_daily",
  {
    schoolId: uuid("school_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    emails: integer("emails").notNull(),
    sms: integer("sms").notNull(),
    signIns: integer("sign_ins").notNull(),
    measuredAt: instant("measured_at").notNull(),
  },
  (t) => [
    primaryKey({
      name: "school_usage_daily_pkey",
      columns: [t.schoolId, t.day],
    }),
    foreignKey({
      name: "school_usage_daily_school_id_fkey",
      columns: [t.schoolId],
      foreignColumns: [schools.id],
    }),
    check(
      "school_usage_daily_counts_check",
      sql`emails >= 0 and sms >= 0 and sign_ins >= 0`,
    ),
  ],
);

/**
 * The day a school first took each step of its onboarding: the cell records
 * what its measure sees, the console the first invoice paid and the steps
 * an operator ticks. A step stays taken from the day it was first seen.
 */
export const schoolOnboarding = pgTable(
  "school_onboarding",
  {
    schoolId: uuid("school_id").notNull(),
    item: text("item").$type<OnboardingItem>().notNull(),
    reachedAt: instant("reached_at").notNull(),
    /** The operator who ticked it, for a step only an operator marks. */
    operatorId: text("operator_id"),
  },
  (t) => [
    primaryKey({
      name: "school_onboarding_pkey",
      columns: [t.schoolId, t.item],
    }),
    foreignKey({
      name: "school_onboarding_school_id_fkey",
      columns: [t.schoolId],
      foreignColumns: [schools.id],
    }),
    check(
      "school_onboarding_item_check",
      sql`item in ('admin_signed_in', 'school_details', 'year_ready', 'classes', 'staff_invited', 'staff_signed_in', 'students_imported', 'guardians_linked', 'timetable_ready', 'families_signed_in', 'first_assignment', 'first_register', 'website_published', 'admissions_ready', 'custom_domain', 'first_invoice_paid', 'kickoff_call', 'training', 'data_import')`,
    ),
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
      sql`subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain', 'integration_client')`,
    ),
    check("changes_action_check", sql`char_length(action) between 1 and 60`),
    check("changes_reason_check", sql`char_length(reason) between 1 and 500`),
  ],
);
