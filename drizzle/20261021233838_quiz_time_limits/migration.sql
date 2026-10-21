CREATE TABLE "core"."quiz_sittings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quiz_sittings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quiz_sittings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "quiz_sittings_version_check" CHECK (version > 0),
	CONSTRAINT "quiz_sittings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "quiz_sittings_attempt_check" CHECK (attempt between 1 and 100),
	CONSTRAINT "quiz_sittings_ends_at_check" CHECK (ends_at is null or ends_at > started_at)
);
--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "quiz_time_limit" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sittings_key" ON "core"."quiz_sittings" ("tenant_id","submission_id","attempt") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "quiz_sittings_open_idx" ON "core"."quiz_sittings" ("tenant_id","ends_at") WHERE status = 'active' and closed_at is null and ends_at is not null;--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD CONSTRAINT "quiz_sittings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD CONSTRAINT "quiz_sittings_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_quiz_time_limit_check" CHECK (quiz_time_limit is null or quiz_time_limit between 1 and 480);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."quiz_sittings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."quiz_sittings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."quiz_sittings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."quiz_sittings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."quiz_sittings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);