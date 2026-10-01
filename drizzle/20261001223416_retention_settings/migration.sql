CREATE TABLE "core"."retention_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_rule" text,
	"student_value" smallint,
	"staff_years" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "retention_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "retention_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "retention_settings_version_check" CHECK (version > 0),
	CONSTRAINT "retention_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "retention_settings_student_rule_check" CHECK (student_rule in ('years_after_leaving', 'until_age')),
	CONSTRAINT "retention_settings_student_value_check" CHECK ((student_rule is null) = (student_value is null) and (student_rule <> 'years_after_leaving' or student_value between 1 and 100) and (student_rule <> 'until_age' or student_value between 18 and 100)),
	CONSTRAINT "retention_settings_staff_years_check" CHECK (staff_years between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "retention_settings_org_key" ON "core"."retention_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ADD CONSTRAINT "retention_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ADD CONSTRAINT "retention_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."retention_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."retention_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."retention_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."retention_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."retention_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);