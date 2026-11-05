import type { ModuleId } from "@faridalms/domain/modules";
import type { OperatorRole } from "@faridalms/domain/operators";
import type { EntitlementsInput, SchoolNotice } from "@faridalms/domain/plans";
import type {
  AddOnKind,
  BillingSchedule,
  ContactRole,
  Currency,
  LimitKey,
  PriceUnit,
  SubscriptionState,
} from "@faridalms/domain/subscriptions";

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { JsonValue } from "../json";

const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () =>
  instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`);

/**
 * The company's own people who run the console, by the opaque id the
 * console derives from their identity provider. The first to sign in when
 * none exists is the owner; anyone after holds no role until an owner gives
 * them one.
 */
export const operators = pgTable(
  "operators",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    roles: text("roles").$type<OperatorRole>().array().notNull(),
    state: text("state")
      .$type<"active" | "disabled">()
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    lastSignedInAt: instant("last_signed_in_at"),
  },
  () => [
    check(
      "operators_roles_check",
      sql`cardinality(roles) <= 4 and roles <@ array['owner', 'sales', 'support', 'finance']::text[]`,
    ),
    check("operators_state_check", sql`state in ('active', 'disabled')`),
    check("operators_name_check", sql`char_length(name) between 1 and 200`),
  ],
);

/**
 * Every business action, appended and never changed: who, what, on which
 * record, the record before and after, and why.
 */
export const businessEvents = pgTable(
  "business_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    occurredAt: instant("occurred_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    operatorId: text("operator_id").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    before: jsonb("before").$type<JsonValue>(),
    after: jsonb("after").$type<JsonValue>(),
    reason: text("reason"),
  },
  (t) => [
    check("business_events_action_check", sql`action ~ '^[a-z_]+\\.[a-z_]+$'`),
    check(
      "business_events_reason_check",
      sql`reason is null or char_length(reason) between 1 and 500`,
    ),
    index("business_events_subject_idx").on(t.subjectType, t.subjectId),
    index("business_events_occurred_idx").on(t.occurredAt),
    index("business_events_action_idx").on(t.action, t.occurredAt),
  ],
);

const limitColumns = () => ({
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
});

/** A plan the company sells, named once; what it gives lives in its versions. */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    code: text("code").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("plans_code_key").on(t.code),
    check("plans_code_check", sql`code ~ '^[a-z][a-z0-9_]{1,39}$'`),
  ],
);

/**
 * One version of a plan: its names, modules, limits and the day it may be
 * sold from. A version is never changed, only retired, so a contract keeps
 * what it bought and a new price is a new version.
 */
export const planVersions = pgTable(
  "plan_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    version: integer("version").notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    modules: text("modules").$type<ModuleId>().array().notNull(),
    ...limitColumns(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    retiredAt: instant("retired_at"),
    createdAt: createdAt(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    uniqueIndex("plan_versions_plan_version_key").on(t.planId, t.version),
    check(
      "plan_versions_modules_check",
      sql`modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[]`,
    ),
    check(
      "plan_versions_limits_check",
      sql`pool_bytes > 0 and class_bytes > 0 and module_bytes > 0 and person_bytes > 0
        and coalesce(students, 0) >= 0 and coalesce(staff_accounts, 0) >= 0
        and coalesce(video_hours, 0) >= 0 and coalesce(custom_domains, 0) >= 0
        and coalesce(email_per_month, 0) >= 0 and coalesce(caption_minutes, 0) >= 0`,
    ),
    check("plan_versions_version_check", sql`version > 0`),
  ],
);

/** Something sold beside a plan: a module, a pack of one limit, or a service. */
export const addOns = pgTable(
  "add_ons",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    code: text("code").notNull(),
    kind: text("kind").$type<AddOnKind>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("add_ons_code_key").on(t.code),
    check("add_ons_code_check", sql`code ~ '^[a-z][a-z0-9_]{1,39}$'`),
    check(
      "add_ons_kind_check",
      sql`kind in ('module', 'limit_pack', 'service')`,
    ),
  ],
);

/** One version of an add-on, never changed once written, as a plan version. */
export const addOnVersions = pgTable(
  "add_on_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    addOnId: uuid("add_on_id")
      .notNull()
      .references(() => addOns.id),
    version: integer("version").notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    module: text("module").$type<ModuleId>(),
    limitKey: text("limit_key").$type<LimitKey>(),
    amount: bigint("amount", { mode: "number" }),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    retiredAt: instant("retired_at"),
    createdAt: createdAt(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    uniqueIndex("add_on_versions_add_on_version_key").on(t.addOnId, t.version),
    check(
      "add_on_versions_module_check",
      sql`module is null or module = any (array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[])`,
    ),
    check(
      "add_on_versions_limit_key_check",
      sql`limit_key is null or limit_key = any (array['poolBytes', 'classBytes', 'moduleBytes', 'personBytes', 'students', 'staffAccounts', 'videoHours', 'customDomains', 'emailPerMonth', 'captionMinutes']::text[])`,
    ),
    check(
      "add_on_versions_shape_check",
      sql`(module is not null and limit_key is null and amount is null)
        or (module is null and limit_key is not null and amount is not null)
        or (module is null and limit_key is null and amount is null)`,
    ),
    check("add_on_versions_amount_check", sql`amount is null or amount > 0`),
    check("add_on_versions_version_check", sql`version > 0`),
  ],
);

/** A list price of a plan or add-on version, in minor units of its currency. */
export const prices = pgTable(
  "prices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    planVersionId: uuid("plan_version_id").references(() => planVersions.id),
    addOnVersionId: uuid("add_on_version_id").references(
      () => addOnVersions.id,
    ),
    currency: text("currency").$type<Currency>().notNull(),
    unit: text("unit").$type<PriceUnit>().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    minimumMinor: bigint("minimum_minor", { mode: "number" })
      .notNull()
      .default(0),
  },
  (t) => [
    check(
      "prices_owner_check",
      sql`(plan_version_id is null) <> (add_on_version_id is null)`,
    ),
    check("prices_currency_check", sql`currency in ('EGP', 'USD')`),
    check(
      "prices_unit_check",
      sql`unit in ('student_year', 'school_year', 'once')`,
    ),
    check("prices_amount_check", sql`amount_minor >= 0 and minimum_minor >= 0`),
    uniqueIndex("prices_plan_currency_key")
      .on(t.planVersionId, t.currency, t.unit)
      .where(sql`plan_version_id is not null`),
    uniqueIndex("prices_add_on_currency_key")
      .on(t.addOnVersionId, t.currency, t.unit)
      .where(sql`add_on_version_id is not null`),
  ],
);

/**
 * A school or group the company sells to: its legal identity for invoices,
 * the currency it pays in, the tenant it became, and the standing terms and
 * data processing agreement it accepted, by version.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    legalNameEn: text("legal_name_en").notNull(),
    legalNameAr: text("legal_name_ar"),
    taxNumber: text("tax_number"),
    commercialRegistry: text("commercial_registry"),
    address: text("address"),
    country: text("country").notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    tenantId: uuid("tenant_id"),
    termsVersion: text("terms_version"),
    termsAcceptedAt: instant("terms_accepted_at"),
    dpaVersion: text("dpa_version"),
    dpaAcceptedAt: instant("dpa_accepted_at"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("customers_tenant_key").on(t.tenantId),
    check("customers_country_check", sql`country ~ '^[A-Z]{2}$'`),
    check("customers_currency_check", sql`currency in ('EGP', 'USD')`),
    check(
      "customers_legal_name_check",
      sql`char_length(legal_name_en) between 1 and 200`,
    ),
    check(
      "customers_terms_check",
      sql`(terms_version is null) = (terms_accepted_at is null) and (dpa_version is null) = (dpa_accepted_at is null)`,
    ),
  ],
);

/** People at a customer the company writes to; business contacts, never accounts. */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    roles: text("roles").$type<ContactRole>().array().notNull(),
    locale: text("locale").$type<"en" | "ar">().notNull().default("en"),
    status: text("status")
      .$type<"active" | "removed">()
      .notNull()
      .default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    index("contacts_customer_idx").on(t.customerId),
    check(
      "contacts_roles_check",
      sql`roles <@ array['billing', 'decision_maker', 'technical']::text[]`,
    ),
    check("contacts_locale_check", sql`locale in ('en', 'ar')`),
    check("contacts_status_check", sql`status in ('active', 'removed')`),
    check("contacts_reach_check", sql`email is not null or phone is not null`),
  ],
);

/**
 * What a customer bought for a tenant: a term of the school year, how it
 * renews and is billed, and the students it was contracted for. A trial has
 * an end and no term; a grandfathered subscription keeps what a school had
 * before the console sold anything, until its first renewal.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    tenantId: uuid("tenant_id").notNull(),
    state: text("state").$type<SubscriptionState>().notNull(),
    termStartsOn: date("term_starts_on", { mode: "string" }),
    termEndsOn: date("term_ends_on", { mode: "string" }),
    trialEndsOn: date("trial_ends_on", { mode: "string" }),
    renewal: text("renewal")
      .$type<"auto" | "manual">()
      .notNull()
      .default("auto"),
    schedule: text("schedule")
      .$type<BillingSchedule>()
      .notNull()
      .default("annual"),
    currency: text("currency").$type<Currency>().notNull(),
    contractedStudents: integer("contracted_students"),
    censusOn: date("census_on", { mode: "string" }),
    grandfathered: boolean("grandfathered").notNull().default(false),
    notice: text("notice").$type<SchoolNotice>(),
    revision: integer("revision").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index("subscriptions_tenant_idx").on(t.tenantId),
    index("subscriptions_customer_idx").on(t.customerId),
    uniqueIndex("subscriptions_open_tenant_key")
      .on(t.tenantId)
      .where(sql`state in ('trial', 'active')`),
    check(
      "subscriptions_state_check",
      sql`state in ('trial', 'active', 'ended')`,
    ),
    check("subscriptions_renewal_check", sql`renewal in ('auto', 'manual')`),
    check(
      "subscriptions_schedule_check",
      sql`schedule in ('annual', 'two', 'three')`,
    ),
    check("subscriptions_currency_check", sql`currency in ('EGP', 'USD')`),
    check(
      "subscriptions_notice_check",
      sql`notice in ('payment_overdue', 'plan_ends_soon')`,
    ),
    check(
      "subscriptions_term_check",
      sql`(term_starts_on is null) = (term_ends_on is null) and (term_ends_on is null or term_ends_on > term_starts_on)`,
    ),
    check(
      "subscriptions_trial_check",
      sql`state <> 'trial' or trial_ends_on is not null`,
    ),
    check(
      "subscriptions_students_check",
      sql`contracted_students is null or contracted_students > 0`,
    ),
  ],
);

/**
 * A plan version or add-on version in a subscription: how many, at what
 * unit price and discount, for which of the tenant's schools (all when
 * empty), and from when to when. A change ends one item and starts another,
 * so what a school had on any day can be read back.
 */
export const subscriptionItems = pgTable(
  "subscription_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    planVersionId: uuid("plan_version_id").references(() => planVersions.id),
    addOnVersionId: uuid("add_on_version_id").references(
      () => addOnVersions.id,
    ),
    quantity: integer("quantity").notNull().default(1),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    schoolIds: uuid("school_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }),
    createdAt: createdAt(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("subscription_items_subscription_idx").on(t.subscriptionId),
    check(
      "subscription_items_owner_check",
      sql`(plan_version_id is null) <> (add_on_version_id is null)`,
    ),
    check("subscription_items_quantity_check", sql`quantity > 0`),
    check("subscription_items_price_check", sql`unit_price_minor >= 0`),
    check(
      "subscription_items_discount_check",
      sql`discount_percent >= 0 and discount_percent <= 100`,
    ),
    check(
      "subscription_items_span_check",
      sql`ends_on is null or ends_on > starts_on`,
    ),
  ],
);

/**
 * A module given or taken away, or a limit set, for one school or all, for
 * a while, with the reason; a daily job republishes when one ends.
 */
export const subscriptionOverrides = pgTable(
  "subscription_overrides",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    schoolId: uuid("school_id"),
    module: text("module").$type<ModuleId>(),
    granted: boolean("granted"),
    limitKey: text("limit_key").$type<LimitKey>(),
    value: bigint("value", { mode: "number" }),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("subscription_overrides_subscription_idx").on(t.subscriptionId),
    check(
      "subscription_overrides_module_check",
      sql`module is null or module = any (array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[])`,
    ),
    check(
      "subscription_overrides_limit_key_check",
      sql`limit_key is null or limit_key = any (array['poolBytes', 'classBytes', 'moduleBytes', 'personBytes', 'students', 'staffAccounts', 'videoHours', 'customDomains', 'emailPerMonth', 'captionMinutes']::text[])`,
    ),
    check(
      "subscription_overrides_shape_check",
      sql`(module is not null and granted is not null and limit_key is null and value is null)
        or (module is null and granted is null and limit_key is not null)`,
    ),
    check(
      "subscription_overrides_storage_check",
      sql`limit_key not in ('poolBytes', 'classBytes', 'moduleBytes', 'personBytes') or value > 0`,
    ),
    check(
      "subscription_overrides_span_check",
      sql`ends_on is null or ends_on > starts_on`,
    ),
    check(
      "subscription_overrides_reason_check",
      sql`char_length(reason) between 1 and 500`,
    ),
  ],
);

/**
 * Each time a subscription's result was written to the directory for a
 * school: what was published and from which revision, so "why does this
 * school have coding" has an answer.
 */
export const entitlementPublications = pgTable(
  "entitlement_publications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    schoolId: uuid("school_id").notNull(),
    revision: integer("revision").notNull(),
    entitlements: jsonb("entitlements").$type<EntitlementsInput>().notNull(),
    publishedAt: instant("published_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    operatorId: text("operator_id").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [
    index("entitlement_publications_school_idx").on(t.schoolId, t.publishedAt),
  ],
);
