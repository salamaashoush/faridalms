CREATE TABLE "core"."reading_norms" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"language" text NOT NULL,
	"rows" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "reading_norms_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "reading_norms_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "reading_norms_version_check" CHECK (version > 0),
	CONSTRAINT "reading_norms_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "reading_norms_language_check" CHECK (language in ('en', 'ar')),
	CONSTRAINT "reading_norms_rows_check" CHECK (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 60)
);
--> statement-breakpoint
ALTER TABLE "core"."reading_norms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD COLUMN "fluency" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "reading_norms_key" ON "core"."reading_norms" ("tenant_id","org_id","language") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."reading_norms" ADD CONSTRAINT "reading_norms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."reading_norms" ADD CONSTRAINT "reading_norms_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_fluency_check" CHECK (fluency is null or (jsonb_typeof(fluency) = 'object' and octet_length(fluency::text) <= 16384));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."reading_norms" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."reading_norms" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."reading_norms" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."reading_norms" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."reading_norms" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);