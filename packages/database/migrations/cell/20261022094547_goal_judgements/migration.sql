CREATE TABLE "core"."goal_judgements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"level" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"lesson_id" uuid,
	"block_id" uuid,
	"judged_by_user_id" uuid NOT NULL,
	"judged_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "goal_judgements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "goal_judgements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "goal_judgements_version_check" CHECK (version > 0),
	CONSTRAINT "goal_judgements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "goal_judgements_level_check" CHECK (level in ('emerging', 'expected')),
	CONSTRAINT "goal_judgements_note_check" CHECK (char_length(note) <= 1000),
	CONSTRAINT "goal_judgements_work_check" CHECK ((lesson_id is null) = (block_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_judgements_key" ON "core"."goal_judgements" ("tenant_id","student_user_id","standard_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_judged_by_user_id_fkey" FOREIGN KEY ("tenant_id","judged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."goal_judgements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."goal_judgements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."goal_judgements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."goal_judgements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."goal_judgements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."goal_judgements" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."goal_judgements" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));