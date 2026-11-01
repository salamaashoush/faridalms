CREATE TABLE "core"."program_remarks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"finished_at" timestamp with time zone,
	"remarked" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "program_remarks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "program_remarks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "program_remarks_version_check" CHECK (version > 0),
	CONSTRAINT "program_remarks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "program_remarks_state_check" CHECK (state in ('pending', 'done')),
	CONSTRAINT "program_remarks_finished_check" CHECK ((state = 'done') = (finished_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "program_remarks_pending_key" ON "core"."program_remarks" ("tenant_id","lesson_id","block_id") WHERE status = 'active' and state = 'pending';--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_document_version_id_fkey" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "core"."document_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_requested_by_user_id_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."program_remarks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."program_remarks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."program_remarks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."program_remarks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."program_remarks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);