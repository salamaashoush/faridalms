CREATE TABLE "core"."bell_schedules" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"name_en" text,
	"name_ar" text,
	"times" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "bell_schedules_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "bell_schedules_tenant_id_id_school_year_id_key" UNIQUE("tenant_id","id","school_year_id"),
	CONSTRAINT "bell_schedules_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "bell_schedules_version_check" CHECK (version > 0),
	CONSTRAINT "bell_schedules_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "bell_schedules_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "bell_schedules_name_en_check" CHECK (char_length(name_en) between 1 and 60),
	CONSTRAINT "bell_schedules_name_ar_check" CHECK (char_length(name_ar) between 1 and 60),
	CONSTRAINT "bell_schedules_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "bell_schedules_times_check" CHECK (jsonb_typeof(times) = 'array' and jsonb_array_length(times) between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."timetables" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"name_en" text,
	"name_ar" text,
	"starts_on" date NOT NULL,
	"cycle_kind" text NOT NULL,
	"cycle_length" smallint NOT NULL,
	"first_day" smallint DEFAULT 1 NOT NULL,
	"closures_move" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "timetables_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "timetables_tenant_id_id_school_year_id_org_id_key" UNIQUE("tenant_id","id","school_year_id","org_id"),
	CONSTRAINT "timetables_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "timetables_version_check" CHECK (version > 0),
	CONSTRAINT "timetables_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "timetables_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "timetables_name_en_check" CHECK (char_length(name_en) between 1 and 60),
	CONSTRAINT "timetables_name_ar_check" CHECK (char_length(name_ar) between 1 and 60),
	CONSTRAINT "timetables_cycle_check" CHECK ((cycle_kind = 'weeks' and cycle_length between 1 and 4)
        or (cycle_kind = 'days' and cycle_length between 2 and 20)),
	CONSTRAINT "timetables_first_day_check" CHECK (first_day between 1 and cycle_length)
);
--> statement-breakpoint
ALTER TABLE "core"."timetables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD COLUMN "bell_schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD COLUMN "timetable_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD COLUMN "day_times" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX "bell_schedules_year_idx" ON "core"."bell_schedules" ("tenant_id","school_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "timetables_start_key" ON "core"."timetables" ("tenant_id","school_year_id","starts_on") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" ADD CONSTRAINT "bell_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" ADD CONSTRAINT "bell_schedules_tenant_id_school_year_id_school_year_type_s_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."timetables" ADD CONSTRAINT "timetables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."timetables" ADD CONSTRAINT "timetables_tenant_id_school_year_id_school_year_type_schoo_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_day_times_check" CHECK (jsonb_typeof(day_times) = 'array' and jsonb_array_length(day_times) <= 6);--> statement-breakpoint
ALTER TABLE "core"."class_meetings" DROP CONSTRAINT "class_meetings_weekday_check", ADD CONSTRAINT "class_meetings_weekday_check" CHECK (weekday between 1 and 28);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."bell_schedules" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."bell_schedules" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."bell_schedules" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."bell_schedules" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."bell_schedules" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."timetables" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."timetables" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."timetables" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."timetables" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."timetables" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);