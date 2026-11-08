CREATE TABLE "core"."goal_reports" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"shared_by_user_id" uuid NOT NULL,
	"shared_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "goal_reports_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "goal_reports_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "goal_reports_version_check" CHECK (version > 0),
	CONSTRAINT "goal_reports_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_reports_key" ON "core"."goal_reports" ("tenant_id","student_user_id","framework_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_framework_id_fkey" FOREIGN KEY ("tenant_id","framework_id") REFERENCES "core"."standard_frameworks"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_shared_by_user_id_fkey" FOREIGN KEY ("tenant_id","shared_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" DROP CONSTRAINT "goal_judgements_level_check", ADD CONSTRAINT "goal_judgements_level_check" CHECK (level in ('emerging', 'expected', 'exempt'));--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" DROP CONSTRAINT "goal_judgements_work_check", ADD CONSTRAINT "goal_judgements_work_check" CHECK ((lesson_id is null or submission_id is null) and (block_id is null) = (lesson_id is null and submission_id is null));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."goal_reports" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."goal_reports" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."goal_reports" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."goal_reports" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."goal_reports" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."goal_reports" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."goal_reports" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));