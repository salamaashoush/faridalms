CREATE TABLE "core"."shared_blocks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "shared_blocks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "shared_blocks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "shared_blocks_version_check" CHECK (version > 0),
	CONSTRAINT "shared_blocks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "shared_blocks_scope_check" CHECK (scope in ('mine', 'school')),
	CONSTRAINT "shared_blocks_title_check" CHECK (char_length(title) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "shared_blocks_org_idx" ON "core"."shared_blocks" ("tenant_id","org_id","scope") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ADD CONSTRAINT "shared_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ADD CONSTRAINT "shared_blocks_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ADD CONSTRAINT "shared_blocks_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."shared_blocks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."shared_blocks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."shared_blocks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."shared_blocks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."shared_blocks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);