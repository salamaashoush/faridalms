CREATE TABLE "core"."lesson_runs" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"code" text NOT NULL,
	"input" text DEFAULT '' NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"output" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_runs_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_runs_attempt_check" CHECK (attempt between 1 and 1000),
	CONSTRAINT "lesson_runs_code_check" CHECK (char_length(code) <= 20000),
	CONSTRAINT "lesson_runs_input_check" CHECK (char_length(input) <= 4000),
	CONSTRAINT "lesson_runs_output_check" CHECK (char_length(output) <= 2000),
	CONSTRAINT "lesson_runs_error_check" CHECK (error is null or char_length(error) between 1 and 500),
	CONSTRAINT "lesson_runs_outcome_check" CHECK (outcome in ('done', 'error', 'timeout', 'output', 'stopped'))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "lesson_runs_student_idx" ON "core"."lesson_runs" ("tenant_id","lesson_id","student_user_id","block_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ADD CONSTRAINT "lesson_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ADD CONSTRAINT "lesson_runs_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ADD CONSTRAINT "lesson_runs_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_runs" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_runs" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_runs" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_runs" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);