CREATE TABLE "core"."classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"class_type" text NOT NULL,
	"code" text NOT NULL,
	"title_en" text,
	"title_ar" text,
	"course_id" uuid,
	"homeroom_class_id" uuid,
	"homeroom_class_type" text GENERATED ALWAYS AS ('homeroom') STORED NOT NULL,
	"subject_descriptor_id" uuid,
	"subject_ns" text GENERATED ALWAYS AS ('subject') STORED NOT NULL,
	"grade_level_descriptor_id" uuid,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"location_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "classes_tenant_id_id_class_type_school_year_id_org_id_key" UNIQUE("tenant_id","id","class_type","school_year_id","org_id"),
	CONSTRAINT "classes_tenant_id_id_class_type_school_year_id_key" UNIQUE("tenant_id","id","class_type","school_year_id"),
	CONSTRAINT "classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "classes_version_check" CHECK (version > 0),
	CONSTRAINT "classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "classes_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "classes_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "classes_class_type_check" CHECK (class_type in ('homeroom', 'scheduled')),
	CONSTRAINT "classes_code_check" CHECK (code ~ '^[A-Za-z0-9_.-]{1,40}$'),
	CONSTRAINT "classes_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "classes_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "classes_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1),
	CONSTRAINT "classes_shape_check" CHECK ((class_type = 'homeroom' and homeroom_class_id is null and subject_descriptor_id is null) or (class_type = 'scheduled' and course_id is not null and subject_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."courses" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"code" text NOT NULL,
	"title_en" text,
	"title_ar" text,
	"subject_descriptor_id" uuid NOT NULL,
	"subject_ns" text GENERATED ALWAYS AS ('subject') STORED NOT NULL,
	"grade_level_descriptor_id" uuid,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "courses_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "courses_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "courses_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "courses_version_check" CHECK (version > 0),
	CONSTRAINT "courses_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "courses_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "courses_code_check" CHECK (code ~ '^[A-Za-z0-9_.-]{1,40}$'),
	CONSTRAINT "courses_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "courses_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "courses_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."enrollments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"class_id" uuid NOT NULL,
	"class_type" text NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"classroom_position_descriptor_id" uuid,
	"classroom_position_ns" text GENERATED ALWAYS AS ('classroom_position') STORED NOT NULL,
	"valid_during" daterange NOT NULL,
	"source" text NOT NULL,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "enrollments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "enrollments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "enrollments_version_check" CHECK (version > 0),
	CONSTRAINT "enrollments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "enrollments_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "enrollments_role_check" CHECK (role in ('student', 'teacher', 'aide', 'proctor', 'administrator')),
	CONSTRAINT "enrollments_primary_check" CHECK (not is_primary or role = 'teacher'),
	CONSTRAINT "enrollments_position_check" CHECK (classroom_position_descriptor_id is null or role in ('teacher', 'aide')),
	CONSTRAINT "enrollments_source_check" CHECK (source in ('manual', 'import', 'sis', 'oneroster', 'rollover')),
	CONSTRAINT "enrollments_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and not upper_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_code_key" ON "core"."classes" ("tenant_id","org_id","school_year_id","code") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "classes_year_idx" ON "core"."classes" ("tenant_id","org_id","school_year_id","class_type") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "classes_homeroom_idx" ON "core"."classes" ("tenant_id","homeroom_class_id") WHERE status = 'active' and homeroom_class_id is not null;--> statement-breakpoint
CREATE INDEX "classes_delta_idx" ON "core"."classes" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_code_key" ON "core"."courses" ("tenant_id","org_id","code") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "courses_delta_idx" ON "core"."courses" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "core"."enrollments" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_user_idx" ON "core"."enrollments" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_delta_idx" ON "core"."enrollments" ("tenant_id","date_last_modified");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_school_year_id_school_year_type_school_y_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_course_id_org_id_fkey" FOREIGN KEY ("tenant_id","course_id","org_id") REFERENCES "core"."courses"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_homeroom_class_id_homeroom_class_type_sc_fkey" FOREIGN KEY ("tenant_id","homeroom_class_id","homeroom_class_type","school_year_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_subject_descriptor_id_subject_ns_fkey" FOREIGN KEY ("tenant_id","subject_descriptor_id","subject_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_grade_level_descriptor_id_grade_level_ns_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_subject_descriptor_id_subject_ns_fkey" FOREIGN KEY ("tenant_id","subject_descriptor_id","subject_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_grade_level_descriptor_id_grade_level_ns_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_class_id_class_type_school_year_id_o_fkey" FOREIGN KEY ("tenant_id","class_id","class_type","school_year_id","org_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_classroom_position_descriptor_id_cla_fkey" FOREIGN KEY ("tenant_id","classroom_position_descriptor_id","classroom_position_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."classes" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."courses" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."courses" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."courses" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."courses" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."courses" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."courses" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."enrollments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."enrollments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."enrollments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."enrollments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."enrollments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."enrollments" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."enrollments" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');