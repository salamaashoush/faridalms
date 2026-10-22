CREATE TABLE "core"."lesson_releases" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"released_by_user_id" uuid NOT NULL,
	"released_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_releases_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_releases_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_releases_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_releases_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD COLUMN "results_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_releases_key" ON "core"."lesson_releases" ("tenant_id","lesson_id","class_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_released_by_user_id_fkey" FOREIGN KEY ("tenant_id","released_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_releases" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_releases" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_releases" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_releases" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_releases" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);