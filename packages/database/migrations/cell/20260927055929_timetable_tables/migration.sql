CREATE TABLE "core"."class_meetings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_type" text NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"group_class_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"class_period_id" uuid NOT NULL,
	"teacher_user_id" uuid,
	"location_id" uuid,
	"valid_during" daterange NOT NULL,
	"clash_accepted" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_meetings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_meetings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_meetings_version_check" CHECK (version > 0),
	CONSTRAINT "class_meetings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_meetings_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "class_meetings_weekday_check" CHECK (weekday between 1 and 7),
	CONSTRAINT "class_meetings_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and not upper_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "class_meetings_group_idx" ON "core"."class_meetings" ("tenant_id","group_class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_meetings_teacher_idx" ON "core"."class_meetings" ("tenant_id","teacher_user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_class_id_class_type_school_year_i_fkey" FOREIGN KEY ("tenant_id","class_id","class_type","school_year_id","org_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_group_class_id_fkey" FOREIGN KEY ("tenant_id","group_class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_class_period_id_school_year_id_or_fkey" FOREIGN KEY ("tenant_id","class_period_id","school_year_id","org_id") REFERENCES "core"."class_periods"("tenant_id","id","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_teacher_user_id_fkey" FOREIGN KEY ("tenant_id","teacher_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_meetings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_meetings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_meetings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_meetings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_meetings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);