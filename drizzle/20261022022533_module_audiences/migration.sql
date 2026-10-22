CREATE TABLE "core"."module_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"module_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"group_id" uuid,
	"student_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "module_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "module_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "module_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "module_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "module_audiences_member_check" CHECK ((group_id is null) <> (student_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD COLUMN "audience" text DEFAULT 'class' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "module_audiences_group_key" ON "core"."module_audiences" ("tenant_id","module_id","class_id","group_id") WHERE status = 'active' and group_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "module_audiences_student_key" ON "core"."module_audiences" ("tenant_id","module_id","class_id","student_user_id") WHERE status = 'active' and student_user_id is not null;--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id","group_id") REFERENCES "core"."class_groups"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_audience_check" CHECK (audience in ('class', 'selected'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."module_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."module_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."module_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."module_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."module_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."module_audiences" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."module_audiences" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));