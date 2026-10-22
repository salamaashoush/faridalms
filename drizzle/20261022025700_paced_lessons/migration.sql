CREATE TABLE "core"."paced_lessons" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "paced_lessons_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "paced_lessons_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "paced_lessons_version_check" CHECK (version > 0),
	CONSTRAINT "paced_lessons_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "paced_lessons_step_check" CHECK (step between 0 and 999)
);
--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "paced_lessons_running_key" ON "core"."paced_lessons" ("tenant_id","lesson_id","class_id") WHERE status = 'active' and ended_at is null;--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_started_by_user_id_fkey" FOREIGN KEY ("tenant_id","started_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."paced_lessons" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."paced_lessons" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."paced_lessons" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."paced_lessons" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."paced_lessons" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);