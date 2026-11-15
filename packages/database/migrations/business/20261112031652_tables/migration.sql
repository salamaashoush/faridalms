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
	CONSTRAINT "add_on_versions_module_check" CHECK (module is null or module = any (array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[])),
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
CREATE TABLE "business_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"operator_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	CONSTRAINT "business_events_action_check" CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
	CONSTRAINT "business_events_reason_check" CHECK (reason is null or char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "business_profile" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"legal_name_en" text NOT NULL,
	"legal_name_ar" text NOT NULL,
	"address_en" text NOT NULL,
	"address_ar" text NOT NULL,
	"tax_number" text NOT NULL,
	"commercial_registry" text,
	"email" text NOT NULL,
	"phone" text,
	"website" text,
	"bank_details_en" text,
	"bank_details_ar" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "business_profile_single_check" CHECK (id = 1)
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
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"invoice_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"tax_authority_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "credit_notes_reason_check" CHECK (char_length(reason) between 1 and 500)
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
	"account_owner_id" text,
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
CREATE TABLE "document_numbers" (
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "document_numbers_series_check" CHECK (series in ('INV', 'CN'))
);
--> statement-breakpoint
CREATE TABLE "dunning_pauses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "dunning_pauses_days_check" CHECK (ends_on >= starts_on),
	CONSTRAINT "dunning_pauses_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "dunning_standings" (
	"tenant_id" uuid PRIMARY KEY,
	"customer_id" uuid NOT NULL,
	"standing" text NOT NULL,
	"since" date NOT NULL,
	CONSTRAINT "dunning_standings_standing_check" CHECK (standing in ('restricted', 'read_only', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "dunning_steps" (
	"invoice_id" uuid,
	"step" text,
	"taken_on" date NOT NULL,
	"emailed_to" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "dunning_steps_pkey" PRIMARY KEY("invoice_id","step"),
	CONSTRAINT "dunning_steps_step_check" CHECK (step in ('upcoming', 'due', 'overdue_7', 'overdue_14', 'restrict_notice', 'restricted', 'read_only_notice', 'read_only', 'suspend_notice', 'suspended', 'ended'))
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
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text NOT NULL,
	"item_code" text,
	"period_start" date,
	"period_end" date,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"discount_percent" numeric(5,2) DEFAULT '0' NOT NULL,
	CONSTRAINT "invoice_lines_quantity_check" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid,
	"kind" text NOT NULL,
	"schedule_key" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"number" text,
	"issued_on" date,
	"due_on" date,
	"for_day" date NOT NULL,
	"currency" text NOT NULL,
	"country" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"purchase_order" text,
	"vat_percent" numeric(5,2) NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"tax_authority_id" text,
	"payment_link_id" text,
	"payment_order_id" text,
	"payment_link_url" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "invoices_state_check" CHECK (state in ('draft', 'issued', 'partly_paid', 'paid', 'credited')),
	CONSTRAINT "invoices_kind_check" CHECK (kind in ('instalment', 'proration', 'true_up', 'manual')),
	CONSTRAINT "invoices_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "invoices_issued_check" CHECK ((state = 'draft') = (number is null) and (number is null) = (issued_on is null) and (issued_on is null) = (due_on is null))
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "lead_activities_kind_check" CHECK (kind in ('call', 'meeting', 'email', 'note')),
	CONSTRAINT "lead_activities_note_check" CHECK (char_length(note) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"intake_id" uuid,
	"source" text NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"organisation" text NOT NULL,
	"role" text,
	"size" text,
	"country" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"message" text,
	"school_id" uuid,
	"tenant_id" uuid,
	"module" text,
	"owner_id" text,
	"next_step" text,
	"next_step_on" date,
	"lost_reason" text,
	"customer_id" uuid,
	"last_contact_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "leads_state_check" CHECK (state in ('new', 'contacted', 'demo_booked', 'demo_done', 'proposal', 'won', 'lost')),
	CONSTRAINT "leads_source_check" CHECK (source in ('demo_form', 'module_interest', 'manual')),
	CONSTRAINT "leads_lost_check" CHECK ((state = 'lost') = (lost_reason is not null)),
	CONSTRAINT "leads_lost_reason_check" CHECK (lost_reason in ('price', 'timing', 'competitor', 'no_response', 'not_fit')),
	CONSTRAINT "leads_country_check" CHECK (country ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text,
	"roles" text[] NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"last_signed_in_at" timestamp with time zone,
	CONSTRAINT "operators_roles_check" CHECK (cardinality(roles) <= 4 and roles <@ array['owner', 'sales', 'support', 'finance']::text[]),
	CONSTRAINT "operators_state_check" CHECK (state in ('active', 'disabled')),
	CONSTRAINT "operators_name_check" CHECK (char_length(name) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "payment_allocations_amount_check" CHECK (amount_minor > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"method" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"received_on" date NOT NULL,
	"reference" text NOT NULL,
	"provider_transaction_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "payments_method_check" CHECK (method in ('bank_transfer', 'card', 'instapay', 'cheque', 'withholding_certificate')),
	CONSTRAINT "payments_amount_check" CHECK (amount_minor > 0 and fee_minor >= 0),
	CONSTRAINT "payments_currency_check" CHECK (currency in ('EGP', 'USD'))
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
	CONSTRAINT "plan_versions_modules_check" CHECK (modules <@ array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]),
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
CREATE TABLE "provisioning_drafts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"step" text DEFAULT 'customer' NOT NULL,
	"spec" jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}' NOT NULL,
	"tenant_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "provisioning_drafts_state_check" CHECK (state in ('draft', 'created', 'abandoned')),
	CONSTRAINT "provisioning_drafts_step_check" CHECK (step in ('customer', 'schools', 'plan', 'addresses', 'people', 'review')),
	CONSTRAINT "provisioning_drafts_created_check" CHECK (state <> 'created' or tenant_id is not null)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"currency" text NOT NULL,
	"country" text NOT NULL,
	"vat_percent" numeric(5,2) NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"valid_until" date NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment" bytea,
	"draft_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quotes_state_check" CHECK (state in ('draft', 'sent', 'accepted', 'superseded')),
	CONSTRAINT "quotes_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "quotes_party_check" CHECK (lead_id is not null or customer_id is not null),
	CONSTRAINT "quotes_accepted_check" CHECK ((state = 'accepted') = (accepted_at is not null and attachment is not null)),
	CONSTRAINT "quotes_attachment_check" CHECK (attachment is null or octet_length(attachment) <= 10485760)
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
	CONSTRAINT "subscription_overrides_module_check" CHECK (module is null or module = any (array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[])),
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
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"invoice_id" uuid,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"assignee_id" text,
	"done_at" timestamp with time zone,
	"done_by" text,
	"outcome" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "tasks_kind_check" CHECK (kind in ('call', 'contract_end')),
	CONSTRAINT "tasks_title_check" CHECK (char_length(title) between 1 and 300),
	CONSTRAINT "tasks_done_check" CHECK ((done_at is null) = (done_by is null) and (done_at is null) = (outcome is null)),
	CONSTRAINT "tasks_outcome_check" CHECK (outcome is null or char_length(outcome) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"country" text NOT NULL,
	"percent" numeric(5,2) NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"valid_from" date NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "tax_rates_country_check" CHECK (country ~ '^[A-Z]{2}$'),
	CONSTRAINT "tax_rates_percent_check" CHECK (percent between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "add_on_versions_add_on_version_key" ON "add_on_versions" ("add_on_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "add_ons_code_key" ON "add_ons" ("code");--> statement-breakpoint
CREATE INDEX "business_events_subject_idx" ON "business_events" ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "business_events_occurred_idx" ON "business_events" ("occurred_at");--> statement-breakpoint
CREATE INDEX "business_events_action_idx" ON "business_events" ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "contacts_customer_idx" ON "contacts" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes" ("number");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_key" ON "customers" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_numbers_key" ON "document_numbers" ("series","year");--> statement-breakpoint
CREATE INDEX "dunning_pauses_customer_idx" ON "dunning_pauses" ("customer_id","ends_on");--> statement-breakpoint
CREATE INDEX "entitlement_publications_school_idx" ON "entitlement_publications" ("school_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_position_key" ON "invoice_lines" ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_schedule_key" ON "invoices" ("schedule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_payment_order_key" ON "invoices" ("payment_order_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" ("customer_id","for_day");--> statement-breakpoint
CREATE INDEX "invoices_state_idx" ON "invoices" ("state","due_on");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" ("lead_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_intake_key" ON "leads" ("intake_id");--> statement-breakpoint
CREATE INDEX "leads_state_idx" ON "leads" ("state","next_step_on");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_key" ON "payments" ("provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" ("customer_id","received_on");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_version_key" ON "plan_versions" ("plan_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_key" ON "plans" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_plan_currency_key" ON "prices" ("plan_version_id","currency","unit") WHERE plan_version_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prices_add_on_currency_key" ON "prices" ("add_on_version_id","currency","unit") WHERE add_on_version_id is not null;--> statement-breakpoint
CREATE INDEX "provisioning_drafts_state_idx" ON "provisioning_drafts" ("state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_version_key" ON "quotes" ("number","version");--> statement-breakpoint
CREATE INDEX "quotes_lead_idx" ON "quotes" ("lead_id");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" ("customer_id");--> statement-breakpoint
CREATE INDEX "subscription_items_subscription_idx" ON "subscription_items" ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_overrides_subscription_idx" ON "subscription_overrides" ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_open_tenant_key" ON "subscriptions" ("tenant_id") WHERE state in ('trial', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_key" ON "tasks" ("key");--> statement-breakpoint
CREATE INDEX "tasks_open_idx" ON "tasks" ("due_on") WHERE done_at is null;--> statement-breakpoint
CREATE INDEX "tasks_customer_idx" ON "tasks" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_country_from_key" ON "tax_rates" ("country","valid_from");--> statement-breakpoint
ALTER TABLE "add_on_versions" ADD CONSTRAINT "add_on_versions_add_on_id_add_ons_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");--> statement-breakpoint
ALTER TABLE "dunning_pauses" ADD CONSTRAINT "dunning_pauses_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "dunning_standings" ADD CONSTRAINT "dunning_standings_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "dunning_steps" ADD CONSTRAINT "dunning_steps_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");--> statement-breakpoint
ALTER TABLE "entitlement_publications" ADD CONSTRAINT "entitlement_publications_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_plan_version_id_plan_versions_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_add_on_version_id_add_on_versions_id_fkey" FOREIGN KEY ("add_on_version_id") REFERENCES "add_on_versions"("id");--> statement-breakpoint
ALTER TABLE "provisioning_drafts" ADD CONSTRAINT "provisioning_drafts_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_draft_id_provisioning_drafts_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "provisioning_drafts"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_plan_version_id_plan_versions_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_add_on_version_id_add_on_versions_id_fkey" FOREIGN KEY ("add_on_version_id") REFERENCES "add_on_versions"("id");--> statement-breakpoint
ALTER TABLE "subscription_overrides" ADD CONSTRAINT "subscription_overrides_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");