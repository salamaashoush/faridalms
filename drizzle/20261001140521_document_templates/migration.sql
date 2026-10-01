CREATE TABLE "core"."document_templates" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_templates_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_templates_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_templates_version_check" CHECK (version > 0),
	CONSTRAINT "document_templates_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_templates_kind_check" CHECK (kind in ('lesson', 'assignment')),
	CONSTRAINT "document_templates_title_check" CHECK (char_length(title) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "core"."document_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_templates_org_idx" ON "core"."document_templates" ("tenant_id","org_id","kind") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_templates" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_templates" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_templates" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_templates" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_templates" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);