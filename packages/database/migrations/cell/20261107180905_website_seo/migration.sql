CREATE TABLE "core"."site_redirects" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_page_id" uuid,
	"to_url" text,
	"created_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_redirects_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_redirects_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_redirects_version_check" CHECK (version > 0),
	CONSTRAINT "site_redirects_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_redirects_from_path_check" CHECK (char_length(from_path) between 2 and 300 and from_path like '/%' and from_path not like '//%'),
	CONSTRAINT "site_redirects_to_url_check" CHECK (char_length(to_url) between 1 and 2048),
	CONSTRAINT "site_redirects_target_check" CHECK ((to_page_id is null) <> (to_url is null))
);
--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD COLUMN "indexed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD COLUMN "indexed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "site_redirects_from_key" ON "core"."site_redirects" ("tenant_id","org_id","from_path") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_to_page_id_fkey" FOREIGN KEY ("tenant_id","to_page_id") REFERENCES "core"."site_pages"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_redirects" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_redirects" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_redirects" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_redirects" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_redirects" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_redirects" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');