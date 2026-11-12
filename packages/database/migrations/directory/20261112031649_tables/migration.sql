CREATE TABLE "cells" (
	"id" text PRIMARY KEY,
	"jurisdiction" text NOT NULL,
	"provider" text NOT NULL,
	"region" text NOT NULL,
	"app_host" text NOT NULL CONSTRAINT "cells_app_host_key" UNIQUE,
	"api_base_url" text NOT NULL,
	"state" text DEFAULT 'provisioning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "cells_id_check" CHECK (id ~ '^[a-z]{2}-[0-9]{1,2}$'),
	CONSTRAINT "cells_jurisdiction_check" CHECK (jurisdiction ~ '^[A-Z]{2}$'),
	CONSTRAINT "cells_provider_check" CHECK (char_length(provider) between 1 and 40),
	CONSTRAINT "cells_region_check" CHECK (char_length(region) between 1 and 60),
	CONSTRAINT "cells_app_host_check" CHECK (app_host = lower(app_host)),
	CONSTRAINT "cells_api_base_url_check" CHECK (char_length(api_base_url) between 1 and 2048),
	CONSTRAINT "cells_state_check" CHECK (state in ('provisioning', 'open', 'closed', 'draining'))
);
--> statement-breakpoint
CREATE TABLE "changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"actor" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text NOT NULL,
	CONSTRAINT "changes_actor_check" CHECK (actor ~ '^(operator|cell):[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "changes_subject_type_check" CHECK (subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain')),
	CONSTRAINT "changes_action_check" CHECK (char_length(action) between 1 and 60),
	CONSTRAINT "changes_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"hostname" text PRIMARY KEY,
	"school_id" uuid NOT NULL,
	"role" text NOT NULL,
	"canonical" boolean DEFAULT false NOT NULL,
	"challenge" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"verified_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"last_error" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "hosts_hostname_check" CHECK (hostname = lower(hostname) and char_length(hostname) between 3 and 253),
	CONSTRAINT "hosts_role_check" CHECK (role in ('site', 'portal')),
	CONSTRAINT "hosts_state_check" CHECK (state in ('pending', 'verified', 'active', 'failing', 'removed')),
	CONSTRAINT "hosts_challenge_check" CHECK (challenge ~ '^[A-Za-z0-9_-]{32,64}$'),
	CONSTRAINT "hosts_failures_check" CHECK (failures >= 0),
	CONSTRAINT "hosts_last_error_check" CHECK (char_length(last_error) between 1 and 200),
	CONSTRAINT "hosts_check" CHECK (not canonical or state <> 'removed')
);
--> statement-breakpoint
CREATE TABLE "login_index" (
	"key" bytea,
	"tenant_id" uuid,
	CONSTRAINT "login_index_pkey" PRIMARY KEY("key","tenant_id"),
	CONSTRAINT "login_index_key_check" CHECK (octet_length(key) = 32)
);
--> statement-breakpoint
CREATE TABLE "school_entitlements" (
	"school_id" uuid PRIMARY KEY,
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
	"access" text DEFAULT 'full' NOT NULL,
	"trial_ends_on" date,
	"notice" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "school_entitlements_modules_check" CHECK (modules <@ array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]),
	CONSTRAINT "school_entitlements_bytes_check" CHECK (pool_bytes > 0 and class_bytes > 0 and module_bytes > 0 and person_bytes > 0),
	CONSTRAINT "school_entitlements_limits_check" CHECK (coalesce(students, 0) >= 0 and coalesce(staff_accounts, 0) >= 0
        and coalesce(video_hours, 0) >= 0 and coalesce(custom_domains, 0) >= 0
        and coalesce(email_per_month, 0) >= 0 and coalesce(caption_minutes, 0) >= 0),
	CONSTRAINT "school_entitlements_access_check" CHECK (access in ('full', 'restricted', 'read_only')),
	CONSTRAINT "school_entitlements_notice_check" CHECK (notice in ('payment_overdue', 'plan_ends_soon')),
	CONSTRAINT "school_entitlements_revision_check" CHECK (revision > 0)
);
--> statement-breakpoint
CREATE TABLE "school_onboarding" (
	"school_id" uuid,
	"item" text,
	"reached_at" timestamp with time zone NOT NULL,
	"operator_id" text,
	CONSTRAINT "school_onboarding_pkey" PRIMARY KEY("school_id","item"),
	CONSTRAINT "school_onboarding_item_check" CHECK (item in ('admin_signed_in', 'school_details', 'year_ready', 'classes', 'staff_invited', 'staff_signed_in', 'students_imported', 'guardians_linked', 'timetable_ready', 'families_signed_in', 'first_assignment', 'first_register', 'website_published', 'admissions_ready', 'custom_domain', 'first_invoice_paid', 'kickoff_call', 'training', 'data_import'))
);
--> statement-breakpoint
CREATE TABLE "school_plans" (
	"school_id" uuid PRIMARY KEY,
	"pool_bytes" bigint,
	"class_bytes" bigint,
	"module_bytes" bigint,
	"person_bytes" bigint,
	"modules" text[],
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "school_plans_pool_bytes_check" CHECK (pool_bytes > 0),
	CONSTRAINT "school_plans_class_bytes_check" CHECK (class_bytes > 0),
	CONSTRAINT "school_plans_module_bytes_check" CHECK (module_bytes > 0),
	CONSTRAINT "school_plans_person_bytes_check" CHECK (person_bytes > 0),
	CONSTRAINT "school_plans_modules_check" CHECK (modules <@ array['school_years', 'grade_levels', 'homerooms', 'families', 'coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[])
);
--> statement-breakpoint
CREATE TABLE "school_usage" (
	"school_id" uuid PRIMARY KEY,
	"used_bytes" bigint NOT NULL,
	"file_count" integer NOT NULL,
	"students" integer DEFAULT 0 NOT NULL,
	"staff_accounts" integer DEFAULT 0 NOT NULL,
	"signed_in_7d" integer DEFAULT 0 NOT NULL,
	"signed_in_30d" integer DEFAULT 0 NOT NULL,
	"video_minutes" integer DEFAULT 0 NOT NULL,
	"emails_this_month" integer DEFAULT 0 NOT NULL,
	"school_days_7d" integer DEFAULT 0 NOT NULL,
	"failed_deliveries_1d" integer DEFAULT 0 NOT NULL,
	"facts" jsonb DEFAULT '{}' NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "school_usage_used_bytes_check" CHECK (used_bytes >= 0),
	CONSTRAINT "school_usage_file_count_check" CHECK (file_count >= 0),
	CONSTRAINT "school_usage_facts_check" CHECK (jsonb_typeof(facts) = 'object' and octet_length(facts::text) <= 4096),
	CONSTRAINT "school_usage_counts_check" CHECK (students >= 0 and staff_accounts >= 0 and signed_in_7d >= 0 and signed_in_30d >= 0 and video_minutes >= 0 and emails_this_month >= 0 and school_days_7d between 0 and 7 and failed_deliveries_1d >= 0)
);
--> statement-breakpoint
CREATE TABLE "school_usage_daily" (
	"school_id" uuid,
	"day" date,
	"emails" integer NOT NULL,
	"sms" integer NOT NULL,
	"sign_ins" integer NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "school_usage_daily_pkey" PRIMARY KEY("school_id","day"),
	CONSTRAINT "school_usage_daily_counts_check" CHECK (emails >= 0 and sms >= 0 and sign_ins >= 0)
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL CONSTRAINT "schools_slug_key" UNIQUE,
	"name_en" text,
	"name_ar" text,
	"placement" text NOT NULL,
	"legacy_school_id" uuid CONSTRAINT "schools_legacy_school_id_key" UNIQUE,
	"listed" boolean DEFAULT true NOT NULL,
	"moved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "schools_slug_check" CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
	CONSTRAINT "schools_name_en_check" CHECK (char_length(name_en) between 1 and 160),
	CONSTRAINT "schools_name_ar_check" CHECK (char_length(name_ar) between 1 and 160),
	CONSTRAINT "schools_placement_check" CHECK (placement in ('legacy', 'cell')),
	CONSTRAINT "schools_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "schools_check1" CHECK (placement = 'cell' or legacy_school_id is not null)
);
--> statement-breakpoint
CREATE TABLE "sso_domains" (
	"domain" text PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"verification_method" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "sso_domains_domain_check" CHECK (domain = lower(domain) and char_length(domain) between 3 and 253),
	CONSTRAINT "sso_domains_verification_method_check" CHECK (verification_method in ('dns_txt', 'idp_hosted_domain'))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY,
	"kind" text NOT NULL,
	"name_en" text,
	"name_ar" text,
	"cell_id" text NOT NULL,
	"jurisdictions" text[] NOT NULL,
	"state" text DEFAULT 'provisioning' NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "tenants_kind_check" CHECK (kind in ('school_group', 'school')),
	CONSTRAINT "tenants_name_en_check" CHECK (char_length(name_en) between 1 and 160),
	CONSTRAINT "tenants_name_ar_check" CHECK (char_length(name_ar) between 1 and 160),
	CONSTRAINT "tenants_jurisdictions_check" CHECK (array_to_string(jurisdictions, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
	CONSTRAINT "tenants_state_check" CHECK (state in ('provisioning', 'importing', 'active', 'read_only', 'frozen', 'suspended', 'offboarding', 'offboarded')),
	CONSTRAINT "tenants_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "tenants_check1" CHECK (merged_into_id is null or state = 'offboarded')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hosts_canonical_key" ON "hosts" ("school_id","role") WHERE canonical;--> statement-breakpoint
CREATE INDEX "hosts_school_idx" ON "hosts" ("school_id");--> statement-breakpoint
CREATE INDEX "hosts_due_idx" ON "hosts" ("checked_at") WHERE state <> 'removed';--> statement-breakpoint
CREATE INDEX "login_index_tenant_idx" ON "login_index" ("tenant_id");--> statement-breakpoint
CREATE INDEX "schools_tenant_idx" ON "schools" ("tenant_id");--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "login_index" ADD CONSTRAINT "login_index_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_entitlements" ADD CONSTRAINT "school_entitlements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_onboarding" ADD CONSTRAINT "school_onboarding_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_plans" ADD CONSTRAINT "school_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_usage" ADD CONSTRAINT "school_usage_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_usage_daily" ADD CONSTRAINT "school_usage_daily_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "sso_domains" ADD CONSTRAINT "sso_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "tenants"("id");