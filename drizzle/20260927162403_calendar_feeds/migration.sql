CREATE TABLE "core"."calendar_feeds" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_feeds_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_feeds_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_feeds_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_feeds_token_hash_check" CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_token_key" ON "core"."calendar_feeds" ("tenant_id","token_hash") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_owner_key" ON "core"."calendar_feeds" ("tenant_id","user_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_feeds" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_feeds" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_feeds" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_feeds" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_feeds" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."calendar_feeds" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."calendar_feeds" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));