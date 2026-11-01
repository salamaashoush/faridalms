CREATE TABLE "core"."lesson_code" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" text NOT NULL,
	"code" text NOT NULL,
	"based_on" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_code_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_code_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_code_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_code_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_code_block_check" CHECK (block_id ~ '^[0-9a-z]{8,36}$'),
	CONSTRAINT "lesson_code_code_check" CHECK (char_length(code) <= 20000),
	CONSTRAINT "lesson_code_based_on_check" CHECK (based_on ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_code_key" ON "core"."lesson_code" ("tenant_id","lesson_id","student_user_id","block_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ADD CONSTRAINT "lesson_code_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ADD CONSTRAINT "lesson_code_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ADD CONSTRAINT "lesson_code_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_code" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_code" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_code" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_code" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_code" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);