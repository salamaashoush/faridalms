CREATE TABLE "core"."site_published_sign_in" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"media" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_published_sign_in_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_published_sign_in_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_published_sign_in_version_check" CHECK (version > 0),
	CONSTRAINT "site_published_sign_in_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_published_sign_in_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_published_sign_in_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 262144),
	CONSTRAINT "site_published_sign_in_media_check" CHECK (jsonb_typeof(media) = 'object')
);
--> statement-breakpoint
ALTER TABLE "core"."site_published_sign_in" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "site_published_sign_in_key" ON "core"."site_published_sign_in" ("tenant_id","org_id","locale") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."site_published_sign_in" ADD CONSTRAINT "site_published_sign_in_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_published_sign_in" ADD CONSTRAINT "site_published_sign_in_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_published_sign_in" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_published_sign_in" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_published_sign_in" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_published_sign_in" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_published_sign_in" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_published_sign_in" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');