CREATE TABLE "core"."lesson_shares" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"state" text DEFAULT 'offered' NOT NULL,
	"decided_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_shares_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_shares_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_shares_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_shares_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_shares_response_check" CHECK (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
	CONSTRAINT "lesson_shares_state_check" CHECK (state in ('offered', 'shown', 'declined') and (state = 'offered') = (decided_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ADD COLUMN "remixed_from_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_shares_key" ON "core"."lesson_shares" ("tenant_id","lesson_id","student_user_id","block_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ADD CONSTRAINT "lesson_projects_tenant_id_remixed_from_user_id_fkey" FOREIGN KEY ("tenant_id","remixed_from_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_decided_by_user_id_fkey" FOREIGN KEY ("tenant_id","decided_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_shares" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_shares" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_shares" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_shares" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_shares" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);