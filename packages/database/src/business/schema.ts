import type { DunningStep } from "@faridalms/domain/dunning";
import type {
  InvoiceKind,
  InvoiceLine,
  InvoiceState,
  PaymentMethod,
} from "@faridalms/domain/invoices";
import type {
  ActivityKind,
  LeadSource,
  LeadState,
  LostReason,
} from "@faridalms/domain/leads";
import type { ModuleId } from "@faridalms/domain/modules";
import type { OperatorRole } from "@faridalms/domain/operators";
import type { EntitlementsInput, SchoolNotice } from "@faridalms/domain/plans";
import type { DemoRole, DemoSize } from "@faridalms/domain/product";
import type {
  DraftProgress,
  DraftSpec,
  DraftStep,
} from "@faridalms/domain/provisioning-draft";
import type {
  QuoteLine,
  QuoteSpec,
  QuoteState,
} from "@faridalms/domain/quotes";
import type {
  AddOnKind,
  BillingSchedule,
  ContactRole,
  Currency,
  LimitKey,
  PriceUnit,
  SubscriptionState,
} from "@faridalms/domain/subscriptions";
import type { TaskKind } from "@faridalms/domain/tasks";

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytea,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
      sql`modules <@ array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]`,
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
      sql`module is null or module = any (array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[])`,
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
    /** The operator who looks after the customer and is asked to call it. */
    accountOwnerId: text("account_owner_id"),
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
      sql`module is null or module = any (array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[])`,
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

/**
 * A school being set up in the console, step by step, for a customer. It is
 * saved as each step is left, so it can be resumed; creating it records how
 * far it got, so a failure resumes there with the same ids.
 */
export const provisioningDrafts = pgTable(
  "provisioning_drafts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id").references(() => customers.id),
    state: text("state")
      .$type<"draft" | "created" | "abandoned">()
      .notNull()
      .default("draft"),
    step: text("step").$type<DraftStep>().notNull().default("customer"),
    spec: jsonb("spec").$type<DraftSpec>().notNull(),
    progress: jsonb("progress").$type<DraftProgress>().notNull().default({}),
    tenantId: uuid("tenant_id"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t) => [
    index("provisioning_drafts_state_idx").on(t.state, t.updatedAt),
    check(
      "provisioning_drafts_state_check",
      sql`state in ('draft', 'created', 'abandoned')`,
    ),
    check(
      "provisioning_drafts_step_check",
      sql`step in ('customer', 'schools', 'plan', 'addresses', 'people', 'review')`,
    ),
    check(
      "provisioning_drafts_created_check",
      sql`state <> 'created' or tenant_id is not null`,
    ),
  ],
);

/** The business's own legal details: one row, as every quote and invoice prints them. */
export const businessProfile = pgTable(
  "business_profile",
  {
    id: integer("id").primaryKey().default(1),
    legalNameEn: text("legal_name_en").notNull(),
    legalNameAr: text("legal_name_ar").notNull(),
    addressEn: text("address_en").notNull(),
    addressAr: text("address_ar").notNull(),
    taxNumber: text("tax_number").notNull(),
    commercialRegistry: text("commercial_registry"),
    email: text("email").notNull(),
    phone: text("phone"),
    website: text("website"),
    /** Where to transfer, as invoices and the school's Billing page print it. */
    bankDetailsEn: text("bank_details_en"),
    bankDetailsAr: text("bank_details_ar"),
    version: integer("version").notNull().default(1),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  () => [check("business_profile_single_check", sql`id = 1`)],
);

/** VAT by the customer's country, from a day; a rate is never changed, only followed. */
export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    country: text("country").notNull(),
    percent: numeric("percent", { precision: 5, scale: 2 }).notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    /**
     * The customer accounts for the VAT itself: a registered business
     * abroad, invoiced at the rate here with the reverse-charge wording.
     */
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tax_rates_country_from_key").on(t.country, t.validFrom),
    check("tax_rates_country_check", sql`country ~ '^[A-Z]{2}$'`),
    check("tax_rates_percent_check", sql`percent between 0 and 100`),
  ],
);

/**
 * Someone who may buy: from the product site's demonstration form, a
 * school asking about a module, or entered by hand. A lost one is deleted
 * two years after it was last contacted, with its activities.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    intakeId: uuid("intake_id"),
    source: text("source").$type<LeadSource>().notNull(),
    state: text("state").$type<LeadState>().notNull().default("new"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    organisation: text("organisation").notNull(),
    role: text("role").$type<DemoRole>(),
    size: text("size").$type<DemoSize>(),
    country: text("country"),
    locale: text("locale").$type<"en" | "ar">().notNull().default("en"),
    message: text("message"),
    schoolId: uuid("school_id"),
    tenantId: uuid("tenant_id"),
    module: text("module").$type<ModuleId>(),
    ownerId: text("owner_id"),
    nextStep: text("next_step"),
    nextStepOn: date("next_step_on", { mode: "string" }),
    lostReason: text("lost_reason").$type<LostReason>(),
    customerId: uuid("customer_id").references(() => customers.id),
    lastContactAt: instant("last_contact_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("leads_intake_key").on(t.intakeId),
    index("leads_state_idx").on(t.state, t.nextStepOn),
    check(
      "leads_state_check",
      sql`state in ('new', 'contacted', 'demo_booked', 'demo_done', 'proposal', 'won', 'lost')`,
    ),
    check(
      "leads_source_check",
      sql`source in ('demo_form', 'module_interest', 'manual')`,
    ),
    check(
      "leads_lost_check",
      sql`(state = 'lost') = (lost_reason is not null)`,
    ),
    check(
      "leads_lost_reason_check",
      sql`lost_reason in ('price', 'timing', 'competitor', 'no_response', 'not_fit')`,
    ),
    check("leads_country_check", sql`country ~ '^[A-Z]{2}$'`),
  ],
);

/** A call, meeting, email or note on a lead, as it happened. */
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ActivityKind>().notNull(),
    note: text("note").notNull(),
    occurredAt: instant("occurred_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("lead_activities_lead_idx").on(t.leadId, t.occurredAt),
    check(
      "lead_activities_kind_check",
      sql`kind in ('call', 'meeting', 'email', 'note')`,
    ),
    check(
      "lead_activities_note_check",
      sql`char_length(note) between 1 and 4000`,
    ),
  ],
);

/**
 * An offer to a lead or customer, numbered by year, in versions: a change
 * after it is sent is a new version that supersedes it. Accepting one keeps
 * the signed copy or purchase order and starts the school's draft.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    number: text("number").notNull(),
    version: integer("version").notNull().default(1),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id),
    state: text("state").$type<QuoteState>().notNull().default("draft"),
    spec: jsonb("spec").$type<QuoteSpec>().notNull(),
    lines: jsonb("lines").$type<QuoteLine[]>().notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    country: text("country").notNull(),
    vatPercent: numeric("vat_percent", { precision: 5, scale: 2 }).notNull(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    vatMinor: bigint("vat_minor", { mode: "number" }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }).notNull(),
    sentAt: instant("sent_at"),
    acceptedAt: instant("accepted_at"),
    acceptedBy: text("accepted_by"),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type"),
    attachment: bytea("attachment"),
    draftId: uuid("draft_id").references(() => provisioningDrafts.id),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("quotes_number_version_key").on(t.number, t.version),
    index("quotes_lead_idx").on(t.leadId),
    index("quotes_customer_idx").on(t.customerId),
    check(
      "quotes_state_check",
      sql`state in ('draft', 'sent', 'accepted', 'superseded')`,
    ),
    check("quotes_currency_check", sql`currency in ('EGP', 'USD')`),
    check(
      "quotes_party_check",
      sql`lead_id is not null or customer_id is not null`,
    ),
    check(
      "quotes_accepted_check",
      sql`(state = 'accepted') = (accepted_at is not null and attachment is not null)`,
    ),
    check(
      "quotes_attachment_check",
      sql`attachment is null or octet_length(attachment) <= 10485760`,
    ),
  ],
);

/**
 * The last number given in a series and year, so invoices and credit notes
 * are numbered without a gap: the row is locked while the next is given,
 * in the transaction that issues the document.
 */
export const documentNumbers = pgTable(
  "document_numbers",
  {
    series: text("series").$type<"INV" | "CN">().notNull(),
    year: integer("year").notNull(),
    last: integer("last").notNull(),
  },
  (t) => [
    uniqueIndex("document_numbers_key").on(t.series, t.year),
    check("document_numbers_series_check", sql`series in ('INV', 'CN')`),
  ],
);

/**
 * An invoice to a customer: a draft until finance issues it, then a number
 * and dates that never change. An issued invoice is never edited, only
 * credited and invoiced again, because the tax authority holds it.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    kind: text("kind").$type<InvoiceKind>().notNull(),
    /** What a scheduled invoice is for, so it is drafted once. */
    scheduleKey: text("schedule_key"),
    state: text("state").$type<InvoiceState>().notNull().default("draft"),
    number: text("number"),
    issuedOn: date("issued_on", { mode: "string" }),
    dueOn: date("due_on", { mode: "string" }),
    /** The day it is for: an instalment's, a true-up's census. */
    forDay: date("for_day", { mode: "string" }).notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    country: text("country").notNull(),
    language: text("language").$type<"en" | "ar">().notNull().default("en"),
    purchaseOrder: text("purchase_order"),
    vatPercent: numeric("vat_percent", { precision: 5, scale: 2 }).notNull(),
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    vatMinor: bigint("vat_minor", { mode: "number" }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    /** The tax authority's id for it, once finance issues it there. */
    taxAuthorityId: text("tax_authority_id"),
    paymentLinkId: text("payment_link_id"),
    paymentOrderId: text("payment_order_id"),
    paymentLinkUrl: text("payment_link_url"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_key").on(t.number),
    uniqueIndex("invoices_schedule_key").on(t.scheduleKey),
    uniqueIndex("invoices_payment_order_key").on(t.paymentOrderId),
    index("invoices_customer_idx").on(t.customerId, t.forDay),
    index("invoices_state_idx").on(t.state, t.dueOn),
    check(
      "invoices_state_check",
      sql`state in ('draft', 'issued', 'partly_paid', 'paid', 'credited')`,
    ),
    check(
      "invoices_kind_check",
      sql`kind in ('instalment', 'proration', 'true_up', 'manual')`,
    ),
    check("invoices_currency_check", sql`currency in ('EGP', 'USD')`),
    check(
      "invoices_issued_check",
      sql`(state = 'draft') = (number is null) and (number is null) = (issued_on is null) and (issued_on is null) = (due_on is null)`,
    ),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    descriptionEn: text("description_en").notNull(),
    descriptionAr: text("description_ar").notNull(),
    itemCode: text("item_code"),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
  },
  (t) => [
    uniqueIndex("invoice_lines_position_key").on(t.invoiceId, t.position),
    check("invoice_lines_quantity_check", sql`quantity > 0`),
  ],
);

/** A credit against one issued invoice, numbered like it, with why. */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    number: text("number").notNull(),
    issuedOn: date("issued_on", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    lines: jsonb("lines").$type<InvoiceLine[]>().notNull(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    vatMinor: bigint("vat_minor", { mode: "number" }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    taxAuthorityId: text("tax_authority_id"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_notes_number_key").on(t.number),
    index("credit_notes_invoice_idx").on(t.invoiceId),
    check(
      "credit_notes_reason_check",
      sql`char_length(reason) between 1 and 500`,
    ),
  ],
);

/** Money received from a customer, by how and with what reference. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    method: text("method").$type<PaymentMethod>().notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    feeMinor: bigint("fee_minor", { mode: "number" }).notNull().default(0),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    reference: text("reference").notNull(),
    /** A card payment's transaction at the provider, so it is recorded once. */
    providerTransactionId: text("provider_transaction_id"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_key").on(t.providerTransactionId),
    index("payments_customer_idx").on(t.customerId, t.receivedOn),
    check(
      "payments_method_check",
      sql`method in ('bank_transfer', 'card', 'instapay', 'cheque', 'withholding_certificate')`,
    ),
    check("payments_amount_check", sql`amount_minor > 0 and fee_minor >= 0`),
    check("payments_currency_check", sql`currency in ('EGP', 'USD')`),
  ],
);

/** How much of a payment settles which invoice; one transfer may pay two. */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_allocations_invoice_idx").on(t.invoiceId),
    index("payment_allocations_payment_idx").on(t.paymentId),
    check("payment_allocations_amount_check", sql`amount_minor > 0`),
  ],
);

/**
 * A stop of a customer's dunning clock, both days included: a purchase
 * order in process, a disputed amount, a government approval.
 */
export const dunningPauses = pgTable(
  "dunning_pauses",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("dunning_pauses_customer_idx").on(t.customerId, t.endsOn),
    check("dunning_pauses_days_check", sql`ends_on >= starts_on`),
    check(
      "dunning_pauses_reason_check",
      sql`char_length(reason) between 1 and 500`,
    ),
  ],
);

/** A step of the clock taken for an invoice: its email sent, once. */
export const dunningSteps = pgTable(
  "dunning_steps",
  {
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    step: text("step").$type<DunningStep>().notNull(),
    takenOn: date("taken_on", { mode: "string" }).notNull(),
    /** Who the email went to; empty when no contact or no mail was set up. */
    emailedTo: text("emailed_to")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.invoiceId, t.step] }),
    check(
      "dunning_steps_step_check",
      sql`step in ('upcoming', 'due', 'overdue_7', 'overdue_14', 'restrict_notice', 'restricted', 'read_only_notice', 'read_only', 'suspend_notice', 'suspended', 'ended')`,
    ),
  ],
);

/**
 * What the clock last set a tenant to, so a payment undoes the clock's own
 * change and never an operator's. No row is full access.
 */
export const dunningStandings = pgTable(
  "dunning_standings",
  {
    tenantId: uuid("tenant_id").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    standing: text("standing")
      .$type<"restricted" | "read_only" | "suspended">()
      .notNull(),
    since: date("since", { mode: "string" }).notNull(),
  },
  () => [
    check(
      "dunning_standings_standing_check",
      sql`standing in ('restricted', 'read_only', 'suspended')`,
    ),
  ],
);

/** Something an operator is asked to do for a customer, by a day. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: text("kind").$type<TaskKind>().notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    /** What made it, so it is made once. */
    key: text("key").notNull(),
    title: text("title").notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    assigneeId: text("assignee_id"),
    doneAt: instant("done_at"),
    doneBy: text("done_by"),
    outcome: text("outcome"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tasks_key").on(t.key),
    index("tasks_open_idx")
      .on(t.dueOn)
      .where(sql`done_at is null`),
    index("tasks_customer_idx").on(t.customerId),
    check("tasks_kind_check", sql`kind in ('call', 'contract_end')`),
    check("tasks_title_check", sql`char_length(title) between 1 and 300`),
    check(
      "tasks_done_check",
      sql`(done_at is null) = (done_by is null) and (done_at is null) = (outcome is null)`,
    ),
    check(
      "tasks_outcome_check",
      sql`outcome is null or char_length(outcome) between 1 and 1000`,
    ),
  ],
);
