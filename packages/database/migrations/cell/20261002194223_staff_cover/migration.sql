CREATE TABLE "core"."lesson_changes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_period_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"cover_user_id" uuid,
	"location_id" uuid,
	"cancelled" boolean DEFAULT false NOT NULL,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_changes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_changes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_changes_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_changes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_changes_shape_check" CHECK ((cancelled and cover_user_id is null and location_id is null)
        or (not cancelled and (cover_user_id is not null or location_id is not null))),
	CONSTRAINT "lesson_changes_note_check" CHECK (char_length(note) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."staff_absences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"user_id" uuid NOT NULL,
	"span" daterange NOT NULL,
	"period_ids" uuid[],
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "staff_absences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "staff_absences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "staff_absences_version_check" CHECK (version > 0),
	CONSTRAINT "staff_absences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "staff_absences_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "staff_absences_span_check" CHECK (not isempty("span") and not lower_inf("span") and not upper_inf("span") and lower_inc("span") and not upper_inc("span")),
	CONSTRAINT "staff_absences_period_ids_check" CHECK (period_ids is null or cardinality(period_ids) between 1 and 50),
	CONSTRAINT "staff_absences_reason_check" CHECK (reason in ('illness', 'training', 'school_trip', 'personal', 'other')),
	CONSTRAINT "staff_absences_note_check" CHECK (char_length(note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_changes_key" ON "core"."lesson_changes" ("tenant_id","class_id","class_period_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lesson_changes_day_idx" ON "core"."lesson_changes" ("tenant_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lesson_changes_cover_idx" ON "core"."lesson_changes" ("tenant_id","cover_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "staff_absences_user_idx" ON "core"."staff_absences" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_class_period_id_school_year_id_or_fkey" FOREIGN KEY ("tenant_id","class_period_id","school_year_id","org_id") REFERENCES "core"."class_periods"("tenant_id","id","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_cover_user_id_fkey" FOREIGN KEY ("tenant_id","cover_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ADD CONSTRAINT "staff_absences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ADD CONSTRAINT "staff_absences_tenant_id_school_year_id_school_year_type_s_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ADD CONSTRAINT "staff_absences_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_changes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_changes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_changes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_changes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_changes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."staff_absences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."staff_absences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."staff_absences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."staff_absences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."staff_absences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);