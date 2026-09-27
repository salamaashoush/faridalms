CREATE TABLE "core"."attendance_registers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_type" text NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"class_period_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"span" daterange GENERATED ALWAYS AS (daterange(taken_on, taken_on + 1, '[)')) STORED NOT NULL,
	"state" text NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attendance_registers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attendance_registers_tenant_id_id_taken_on_key" UNIQUE("tenant_id","id","taken_on"),
	CONSTRAINT "attendance_registers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attendance_registers_version_check" CHECK (version > 0),
	CONSTRAINT "attendance_registers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attendance_registers_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "attendance_registers_state_check" CHECK (state in ('in_progress', 'submitted')),
	CONSTRAINT "attendance_registers_submitted_at_check" CHECK ((state = 'submitted') = (submitted_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."attendance_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"teacher_edit_days" smallint NOT NULL,
	"notice_delay_minutes" smallint NOT NULL,
	"chronic_percent" smallint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attendance_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attendance_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attendance_settings_version_check" CHECK (version > 0),
	CONSTRAINT "attendance_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attendance_settings_teacher_edit_days_check" CHECK (teacher_edit_days between 0 and 60),
	CONSTRAINT "attendance_settings_notice_delay_minutes_check" CHECK (notice_delay_minutes between 0 and 1440),
	CONSTRAINT "attendance_settings_chronic_percent_check" CHECK (chronic_percent between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_tenant_id_id_school_year_id_org_id_key" UNIQUE("tenant_id","id","school_year_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_registers_key" ON "core"."attendance_registers" ("tenant_id","class_id","taken_on","class_period_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "attendance_registers_day_idx" ON "core"."attendance_registers" ("tenant_id","org_id","taken_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_settings_org_key" ON "core"."attendance_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_class_id_class_type_school__fkey" FOREIGN KEY ("tenant_id","class_id","class_type","school_year_id","org_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_class_period_id_school_year_fkey" FOREIGN KEY ("tenant_id","class_period_id","school_year_id","org_id") REFERENCES "core"."class_periods"("tenant_id","id","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD CONSTRAINT "attendance_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD CONSTRAINT "attendance_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attendance_registers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attendance_registers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attendance_registers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attendance_registers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attendance_registers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attendance_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attendance_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attendance_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attendance_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attendance_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);