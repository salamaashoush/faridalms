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
	CONSTRAINT "changes_subject_type_check" CHECK (subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain', 'integration_client')),
	CONSTRAINT "changes_action_check" CHECK (char_length(action) between 1 and 60),
	CONSTRAINT "changes_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"hostname" text PRIMARY KEY,
	"school_id" uuid NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "hosts_hostname_check" CHECK (hostname = lower(hostname) and char_length(hostname) between 3 and 253)
);
--> statement-breakpoint
CREATE TABLE "integration_clients" (
	"client_id" text PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "integration_clients_client_id_check" CHECK (client_id ~ '^[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "integration_clients_kind_check" CHECK (kind in ('oneroster', 'lti'))
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
	CONSTRAINT "tenants_state_check" CHECK (state in ('provisioning', 'importing', 'active', 'frozen', 'suspended', 'offboarding', 'offboarded')),
	CONSTRAINT "tenants_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "tenants_check1" CHECK (merged_into_id is null or state = 'offboarded')
);
--> statement-breakpoint
CREATE INDEX "integration_clients_tenant_idx" ON "integration_clients" ("tenant_id");--> statement-breakpoint
CREATE INDEX "schools_tenant_idx" ON "schools" ("tenant_id");--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "integration_clients" ADD CONSTRAINT "integration_clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "sso_domains" ADD CONSTRAINT "sso_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "tenants"("id");