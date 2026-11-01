CREATE TABLE "core"."quiz_draws" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"draw_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"bank_question_id" uuid NOT NULL,
	"question" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quiz_draws_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quiz_draws_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "quiz_draws_version_check" CHECK (version > 0),
	CONSTRAINT "quiz_draws_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "quiz_draws_attempt_check" CHECK (attempt between 1 and 100),
	CONSTRAINT "quiz_draws_position_check" CHECK (position between 0 and 19),
	CONSTRAINT "quiz_draws_question_check" CHECK (jsonb_typeof(question) = 'object' and octet_length(question::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "core"."quiz_draws" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_draws_key" ON "core"."quiz_draws" ("tenant_id","submission_id","attempt","draw_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "quiz_draws_bank_question_idx" ON "core"."quiz_draws" ("tenant_id","bank_question_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."quiz_draws" ADD CONSTRAINT "quiz_draws_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_draws" ADD CONSTRAINT "quiz_draws_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."quiz_draws" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."quiz_draws" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."quiz_draws" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."quiz_draws" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."quiz_draws" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);