CREATE TABLE "core"."grade_scale_versions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"scale_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"bands" jsonb NOT NULL,
	"reason" text,
	"created_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "grade_scale_versions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "grade_scale_versions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "grade_scale_versions_version_check" CHECK (version > 0),
	CONSTRAINT "grade_scale_versions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "grade_scale_versions_bands_check" CHECK (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 2 and 20),
	CONSTRAINT "grade_scale_versions_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."grade_scales" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"display" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "grade_scales_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "grade_scales_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "grade_scales_version_check" CHECK (version > 0),
	CONSTRAINT "grade_scales_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "grade_scales_display_check" CHECK (display in ('grade', 'grade_score')),
	CONSTRAINT "grade_scales_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "grade_scales_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "grade_scales_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."grade_scales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."programme_grade_levels" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"programme_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "programme_grade_levels_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "programme_grade_levels_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "programme_grade_levels_version_check" CHECK (version > 0),
	CONSTRAINT "programme_grade_levels_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."programmes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"grade_scale_id" uuid,
	"official_board" text,
	"board_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "programmes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "programmes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "programmes_version_check" CHECK (version > 0),
	CONSTRAINT "programmes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "programmes_official_board_check" CHECK (official_board in ('cambridge', 'pearson', 'ib', 'jcq')),
	CONSTRAINT "programmes_board_check" CHECK (num_nonnulls(official_board, board_id) <= 1),
	CONSTRAINT "programmes_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "programmes_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "programmes_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."programmes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD COLUMN "grade_scale_version_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD COLUMN "programme_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD COLUMN "grade_scale_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD COLUMN "grade_scale_version_id" uuid;--> statement-breakpoint
CREATE INDEX "grade_scale_versions_scale_idx" ON "core"."grade_scale_versions" ("tenant_id","scale_id","effective_from") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "grade_scales_org_idx" ON "core"."grade_scales" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "programme_grade_levels_key" ON "core"."programme_grade_levels" ("tenant_id","programme_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "programme_grade_levels_level_idx" ON "core"."programme_grade_levels" ("tenant_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "programmes_org_idx" ON "core"."programmes" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
-- The new columns are empty on tables that already hold rows; checking
-- them here would read those rows under forced row security with no tenant
-- bound, and new and changed rows are checked all the same.
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_grade_scale_version_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_version_id") REFERENCES "core"."grade_scale_versions"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_programme_id_fkey" FOREIGN KEY ("tenant_id","programme_id") REFERENCES "core"."programmes"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_grade_scale_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_id") REFERENCES "core"."grade_scales"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ADD CONSTRAINT "grade_scale_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ADD CONSTRAINT "grade_scale_versions_tenant_id_scale_id_fkey" FOREIGN KEY ("tenant_id","scale_id") REFERENCES "core"."grade_scales"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ADD CONSTRAINT "grade_scale_versions_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_grade_scale_version_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_version_id") REFERENCES "core"."grade_scale_versions"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ADD CONSTRAINT "programme_grade_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ADD CONSTRAINT "programme_grade_levels_tenant_id_programme_id_fkey" FOREIGN KEY ("tenant_id","programme_id") REFERENCES "core"."programmes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ADD CONSTRAINT "programme_grade_levels_tenant_id_grade_level_descriptor_id_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_grade_scale_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_id") REFERENCES "core"."grade_scales"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_board_id_fkey" FOREIGN KEY ("tenant_id","board_id") REFERENCES "core"."exam_boards"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."grade_scale_versions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."grade_scale_versions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."grade_scale_versions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."grade_scale_versions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."grade_scale_versions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."grade_scales" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."grade_scales" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."grade_scales" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."grade_scales" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."grade_scales" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."programme_grade_levels" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."programme_grade_levels" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."programme_grade_levels" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."programme_grade_levels" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."programme_grade_levels" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."programmes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."programmes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."programmes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."programmes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."programmes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);