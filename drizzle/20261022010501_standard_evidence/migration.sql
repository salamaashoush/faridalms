CREATE TABLE "core"."standard_evidence" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"source" text NOT NULL,
	"lesson_id" uuid,
	"submission_id" uuid,
	"sitting" uuid GENERATED ALWAYS AS (coalesce(lesson_id, submission_id)) STORED NOT NULL,
	"attempt" smallint NOT NULL,
	"block_id" uuid NOT NULL,
	"fraction" numeric(5,4) NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_evidence_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_evidence_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_evidence_version_check" CHECK (version > 0),
	CONSTRAINT "standard_evidence_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_evidence_source_check" CHECK ((source = 'lesson' and lesson_id is not null and submission_id is null) or (source = 'quiz' and submission_id is not null and lesson_id is null)),
	CONSTRAINT "standard_evidence_attempt_check" CHECK (attempt between 1 and 1000),
	CONSTRAINT "standard_evidence_fraction_check" CHECK (fraction between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "standard_evidence_key" ON "core"."standard_evidence" ("tenant_id","sitting","student_user_id","attempt","block_id","standard_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "standard_evidence_student_idx" ON "core"."standard_evidence" ("tenant_id","student_user_id","standard_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_evidence" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_evidence" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_evidence" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_evidence" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_evidence" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."standard_evidence" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."standard_evidence" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));