CREATE TABLE "add_on_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"add_on_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"module" text,
	"limit_key" text,
	"amount" bigint,
	"valid_from" date NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "add_on_versions_module_check" CHECK (module is null or module = any (array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[])),
	CONSTRAINT "add_on_versions_limit_key_check" CHECK (limit_key is null or limit_key = any (array['poolBytes', 'classBytes', 'moduleBytes', 'personBytes', 'students', 'staffAccounts', 'videoHours', 'customDomains', 'emailPerMonth', 'captionMinutes']::text[])),
	CONSTRAINT "add_on_versions_shape_check" CHECK ((module is not null and limit_key is null and amount is null)
        or (module is null and limit_key is not null and amount is not null)
        or (module is null and limit_key is null and amount is null)),
	CONSTRAINT "add_on_versions_amount_check" CHECK (amount is null or amount > 0),
	CONSTRAINT "add_on_versions_version_check" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "add_ons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "add_ons_code_check" CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
	CONSTRAINT "add_ons_kind_check" CHECK (kind in ('module', 'limit_pack', 'service'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"roles" text[] NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "contacts_roles_check" CHECK (roles <@ array['billing', 'decision_maker', 'technical']::text[]),
	CONSTRAINT "contacts_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "contacts_status_check" CHECK (status in ('active', 'removed')),
	CONSTRAINT "contacts_reach_check" CHECK (email is not null or phone is not null)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"legal_name_en" text NOT NULL,
	"legal_name_ar" text,
	"tax_number" text,
	"commercial_registry" text,
	"address" text,
	"country" text NOT NULL,
	"currency" text NOT NULL,
	"tenant_id" uuid,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"dpa_version" text,
	"dpa_accepted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "customers_country_check" CHECK (country ~ '^[A-Z]{2}$'),
	CONSTRAINT "customers_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "customers_legal_name_check" CHECK (char_length(legal_name_en) between 1 and 200),
	CONSTRAINT "customers_terms_check" CHECK ((terms_version is null) = (terms_accepted_at is null) and (dpa_version is null) = (dpa_accepted_at is null))
);
--> statement-breakpoint
CREATE TABLE "entitlement_publications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"subscription_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"entitlements" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"operator_id" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"modules" text[] NOT NULL,
	"pool_bytes" bigint NOT NULL,
	"class_bytes" bigint NOT NULL,
	"module_bytes" bigint NOT NULL,
	"person_bytes" bigint NOT NULL,
	"students" integer,
	"staff_accounts" integer,
	"video_hours" integer,
	"custom_domains" integer,
	"email_per_month" integer,
	"caption_minutes" integer,
	"valid_from" date NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "plan_versions_modules_check" CHECK (modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[]),
	CONSTRAINT "plan_versions_limits_check" CHECK (pool_bytes > 0 and class_bytes > 0 and module_bytes > 0 and person_bytes > 0
        and coalesce(students, 0) >= 0 and coalesce(staff_accounts, 0) >= 0
        and coalesce(video_hours, 0) >= 0 and coalesce(custom_domains, 0) >= 0
        and coalesce(email_per_month, 0) >= 0 and coalesce(caption_minutes, 0) >= 0),
	CONSTRAINT "plan_versions_version_check" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "plans_code_check" CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$')
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"plan_version_id" uuid,
	"add_on_version_id" uuid,
	"currency" text NOT NULL,
	"unit" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"minimum_minor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "prices_owner_check" CHECK ((plan_version_id is null) <> (add_on_version_id is null)),
	CONSTRAINT "prices_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "prices_unit_check" CHECK (unit in ('student_year', 'school_year', 'once')),
	CONSTRAINT "prices_amount_check" CHECK (amount_minor >= 0 and minimum_minor >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"subscription_id" uuid NOT NULL,
	"plan_version_id" uuid,
	"add_on_version_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"discount_percent" numeric(5,2) DEFAULT '0' NOT NULL,
	"school_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "subscription_items_owner_check" CHECK ((plan_version_id is null) <> (add_on_version_id is null)),
	CONSTRAINT "subscription_items_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "subscription_items_price_check" CHECK (unit_price_minor >= 0),
	CONSTRAINT "subscription_items_discount_check" CHECK (discount_percent >= 0 and discount_percent <= 100),
	CONSTRAINT "subscription_items_span_check" CHECK (ends_on is null or ends_on > starts_on)
);
--> statement-breakpoint
CREATE TABLE "subscription_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"subscription_id" uuid NOT NULL,
	"school_id" uuid,
	"module" text,
	"granted" boolean,
	"limit_key" text,
	"value" bigint,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "subscription_overrides_module_check" CHECK (module is null or module = any (array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[])),
	CONSTRAINT "subscription_overrides_limit_key_check" CHECK (limit_key is null or limit_key = any (array['poolBytes', 'classBytes', 'moduleBytes', 'personBytes', 'students', 'staffAccounts', 'videoHours', 'customDomains', 'emailPerMonth', 'captionMinutes']::text[])),
	CONSTRAINT "subscription_overrides_shape_check" CHECK ((module is not null and granted is not null and limit_key is null and value is null)
        or (module is null and granted is null and limit_key is not null)),
	CONSTRAINT "subscription_overrides_storage_check" CHECK (limit_key not in ('poolBytes', 'classBytes', 'moduleBytes', 'personBytes') or value > 0),
	CONSTRAINT "subscription_overrides_span_check" CHECK (ends_on is null or ends_on > starts_on),
	CONSTRAINT "subscription_overrides_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"state" text NOT NULL,
	"term_starts_on" date,
	"term_ends_on" date,
	"trial_ends_on" date,
	"renewal" text DEFAULT 'auto' NOT NULL,
	"schedule" text DEFAULT 'annual' NOT NULL,
	"currency" text NOT NULL,
	"contracted_students" integer,
	"census_on" date,
	"grandfathered" boolean DEFAULT false NOT NULL,
	"notice" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "subscriptions_state_check" CHECK (state in ('trial', 'active', 'ended')),
	CONSTRAINT "subscriptions_renewal_check" CHECK (renewal in ('auto', 'manual')),
	CONSTRAINT "subscriptions_schedule_check" CHECK (schedule in ('annual', 'two', 'three')),
	CONSTRAINT "subscriptions_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "subscriptions_notice_check" CHECK (notice in ('payment_overdue', 'plan_ends_soon')),
	CONSTRAINT "subscriptions_term_check" CHECK ((term_starts_on is null) = (term_ends_on is null) and (term_ends_on is null or term_ends_on > term_starts_on)),
	CONSTRAINT "subscriptions_trial_check" CHECK (state <> 'trial' or trial_ends_on is not null),
	CONSTRAINT "subscriptions_students_check" CHECK (contracted_students is null or contracted_students > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "add_on_versions_add_on_version_key" ON "add_on_versions" ("add_on_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "add_ons_code_key" ON "add_ons" ("code");--> statement-breakpoint
CREATE INDEX "business_events_action_idx" ON "business_events" ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "contacts_customer_idx" ON "contacts" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_key" ON "customers" ("tenant_id");--> statement-breakpoint
CREATE INDEX "entitlement_publications_school_idx" ON "entitlement_publications" ("school_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_version_key" ON "plan_versions" ("plan_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_key" ON "plans" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_plan_currency_key" ON "prices" ("plan_version_id","currency","unit") WHERE plan_version_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prices_add_on_currency_key" ON "prices" ("add_on_version_id","currency","unit") WHERE add_on_version_id is not null;--> statement-breakpoint
CREATE INDEX "subscription_items_subscription_idx" ON "subscription_items" ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_overrides_subscription_idx" ON "subscription_overrides" ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_open_tenant_key" ON "subscriptions" ("tenant_id") WHERE state in ('trial', 'active');--> statement-breakpoint
ALTER TABLE "add_on_versions" ADD CONSTRAINT "add_on_versions_add_on_id_add_ons_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "entitlement_publications" ADD CONSTRAINT "entitlement_publications_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_plan_version_id_plan_versions_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_add_on_version_id_add_on_versions_id_fkey" FOREIGN KEY ("add_on_version_id") REFERENCES "add_on_versions"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_plan_version_id_plan_versions_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_add_on_version_id_add_on_versions_id_fkey" FOREIGN KEY ("add_on_version_id") REFERENCES "add_on_versions"("id");--> statement-breakpoint
ALTER TABLE "subscription_overrides" ADD CONSTRAINT "subscription_overrides_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");