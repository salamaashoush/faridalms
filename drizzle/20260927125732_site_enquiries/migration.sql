CREATE TABLE "core"."site_enquiries" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"page_id" uuid,
	"section_id" uuid,
	"locale" text NOT NULL,
	"purpose" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"child_year" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"network_key" text DEFAULT '' NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_enquiries_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_enquiries_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_enquiries_version_check" CHECK (version > 0),
	CONSTRAINT "site_enquiries_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_enquiries_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_enquiries_purpose_check" CHECK (purpose in ('enquiry', 'visit', 'general')),
	CONSTRAINT "site_enquiries_name_check" CHECK (char_length(name) between 1 and 120),
	CONSTRAINT "site_enquiries_email_check" CHECK (char_length(email) between 3 and 254 and email like '%_@_%'),
	CONSTRAINT "site_enquiries_phone_check" CHECK (char_length(phone) <= 40),
	CONSTRAINT "site_enquiries_child_year_check" CHECK (char_length(child_year) <= 60),
	CONSTRAINT "site_enquiries_message_check" CHECK (char_length(message) <= 2000),
	CONSTRAINT "site_enquiries_network_key_check" CHECK (char_length(network_key) <= 128),
	CONSTRAINT "site_enquiries_handled_check" CHECK ((handled_at is null) = (handled_by is null))
);
--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "site_enquiries_org_idx" ON "core"."site_enquiries" ("tenant_id","org_id","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_enquiries_network_idx" ON "core"."site_enquiries" ("tenant_id","network_key","created_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_handled_by_fkey" FOREIGN KEY ("tenant_id","handled_by") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_enquiries" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_enquiries" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_enquiries" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_enquiries" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_enquiries" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_insert" ON "core"."site_enquiries" AS PERMISSIVE FOR INSERT TO "site" WITH CHECK (status = 'active' and handled_at is null);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_enquiries" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and created_at > statement_timestamp() - interval '1 day');