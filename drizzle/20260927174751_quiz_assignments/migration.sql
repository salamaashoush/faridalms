CREATE TABLE "core"."quiz_answers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"block_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"fraction" numeric(5,4),
	"state" text DEFAULT 'draft' NOT NULL,
	"feedback" text,
	"marked_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quiz_answers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quiz_answers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "quiz_answers_version_check" CHECK (version > 0),
	CONSTRAINT "quiz_answers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "quiz_answers_attempt_check" CHECK (attempt between 1 and 100),
	CONSTRAINT "quiz_answers_response_check" CHECK (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
	CONSTRAINT "quiz_answers_fraction_check" CHECK (fraction is null or fraction between 0 and 1),
	CONSTRAINT "quiz_answers_state_check" CHECK (state in ('draft', 'marked', 'needs_marking') and (state <> 'draft' or fraction is null)),
	CONSTRAINT "quiz_answers_feedback_check" CHECK (feedback is null or char_length(feedback) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "quiz_attempts" smallint;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "quiz_keep" text;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "quiz_reveal" text;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "quiz_shuffle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."assessments" ALTER COLUMN "graded_by_user_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_key" ON "core"."quiz_answers" ("tenant_id","submission_id","attempt","block_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_tenant_id_marked_by_user_id_fkey" FOREIGN KEY ("tenant_id","marked_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_quiz_check" CHECK ((submission_format = 'quiz') = (quiz_keep is not null and quiz_reveal is not null) and (quiz_attempts is null or quiz_attempts between 1 and 10) and (quiz_keep is null or quiz_keep in ('highest', 'latest', 'average', 'first')) and (quiz_reveal is null or quiz_reveal in ('answers', 'marks', 'returned')));--> statement-breakpoint
ALTER TABLE "core"."assignments" DROP CONSTRAINT "assignments_submission_format_check", ADD CONSTRAINT "assignments_submission_format_check" CHECK (submission_format in ('online', 'files', 'both', 'none', 'quiz'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."quiz_answers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."quiz_answers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."quiz_answers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."quiz_answers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."quiz_answers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);