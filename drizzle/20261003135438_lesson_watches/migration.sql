CREATE TABLE "core"."lesson_watches" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"watched" int4multirange DEFAULT '{}' NOT NULL,
	"duration_seconds" integer NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_watches_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_watches_duration_check" CHECK (duration_seconds between 1 and 21600),
	CONSTRAINT "lesson_watches_position_check" CHECK (position_seconds between 0 and duration_seconds),
	CONSTRAINT "lesson_watches_watched_check" CHECK (watched <@ int4multirange(int4range(0, duration_seconds)))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_watches_key" ON "core"."lesson_watches" ("tenant_id","lesson_id","student_user_id","file_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lessons" DROP CONSTRAINT "lessons_completion_check", ADD CONSTRAINT "lessons_completion_check" CHECK (completion in ('view', 'mark', 'quiz', 'score', 'reflection', 'watch'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_watches" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_watches" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_watches" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_watches" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_watches" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);