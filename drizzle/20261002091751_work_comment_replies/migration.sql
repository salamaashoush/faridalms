CREATE TABLE "core"."work_comment_answers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"comment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"state" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "work_comment_answers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_comment_answers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "work_comment_answers_version_check" CHECK (version > 0),
	CONSTRAINT "work_comment_answers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "work_comment_answers_state_check" CHECK (state in ('fixed', 'unclear'))
);
--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."work_comment_replies" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"comment_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "work_comment_replies_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_comment_replies_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "work_comment_replies_version_check" CHECK (version > 0),
	CONSTRAINT "work_comment_replies_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "work_comment_replies_body_check" CHECK (char_length(body) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "work_comment_answers_key" ON "core"."work_comment_answers" ("tenant_id","comment_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "work_comment_replies_comment_idx" ON "core"."work_comment_replies" ("tenant_id","comment_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ADD CONSTRAINT "work_comment_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ADD CONSTRAINT "work_comment_answers_tenant_id_comment_id_fkey" FOREIGN KEY ("tenant_id","comment_id") REFERENCES "core"."work_comments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ADD CONSTRAINT "work_comment_answers_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ADD CONSTRAINT "work_comment_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ADD CONSTRAINT "work_comment_replies_tenant_id_comment_id_fkey" FOREIGN KEY ("tenant_id","comment_id") REFERENCES "core"."work_comments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ADD CONSTRAINT "work_comment_replies_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."work_comment_answers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."work_comment_answers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."work_comment_answers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."work_comment_answers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."work_comment_answers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."work_comment_replies" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."work_comment_replies" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."work_comment_replies" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."work_comment_replies" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."work_comment_replies" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);