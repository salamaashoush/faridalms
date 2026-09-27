CREATE TABLE "core"."learning_modules" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"sequential" boolean DEFAULT true NOT NULL,
	"prerequisite_module_id" uuid,
	"author_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "learning_modules_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "learning_modules_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "learning_modules_version_check" CHECK (version > 0),
	CONSTRAINT "learning_modules_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "learning_modules_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "learning_modules_summary_check" CHECK (char_length(summary) <= 1000),
	CONSTRAINT "learning_modules_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "learning_modules_publish_at_check" CHECK ((state = 'draft') = (publish_at is null)),
	CONSTRAINT "learning_modules_prerequisite_check" CHECK (prerequisite_module_id is null or prerequisite_module_id <> id)
);
--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_progress" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"score" smallint,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"position" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_progress_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_progress_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_progress_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_progress_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_progress_completed_check" CHECK ((completed_at is null) = (completed_by is null)),
	CONSTRAINT "lesson_progress_completed_by_check" CHECK (completed_by is null or completed_by in ('student', 'teacher')),
	CONSTRAINT "lesson_progress_score_check" CHECK (score is null or score between 0 and 100),
	CONSTRAINT "lesson_progress_attempts_check" CHECK (attempts between 0 and 1000),
	CONSTRAINT "lesson_progress_answers_check" CHECK (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536),
	CONSTRAINT "lesson_progress_position_check" CHECK (position is null or char_length(position) <= 64)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lessons" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"module_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"completion" text DEFAULT 'view' NOT NULL,
	"pass_score" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lessons_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lessons_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lessons_version_check" CHECK (version > 0),
	CONSTRAINT "lessons_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lessons_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "lessons_position_check" CHECK (position between 0 and 999),
	CONSTRAINT "lessons_completion_check" CHECK (completion in ('view', 'mark', 'quiz', 'score', 'reflection')),
	CONSTRAINT "lessons_pass_score_check" CHECK ((completion = 'score') = (pass_score is not null) and (pass_score is null or pass_score between 1 and 100))
);
--> statement-breakpoint
ALTER TABLE "core"."lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."module_classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"module_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "module_classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "module_classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "module_classes_version_check" CHECK (version > 0),
	CONSTRAINT "module_classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "module_classes_position_check" CHECK (position between 0 and 999)
);
--> statement-breakpoint
ALTER TABLE "core"."module_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "learning_modules_year_idx" ON "core"."learning_modules" ("tenant_id","org_id","school_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_key" ON "core"."lesson_progress" ("tenant_id","lesson_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lesson_progress_student_idx" ON "core"."lesson_progress" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lessons_module_idx" ON "core"."lessons" ("tenant_id","module_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "module_classes_key" ON "core"."module_classes" ("tenant_id","module_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "module_classes_class_idx" ON "core"."module_classes" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_school_year_id_fkey" FOREIGN KEY ("tenant_id","school_year_id") REFERENCES "core"."academic_sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_prerequisite_module_id_fkey" FOREIGN KEY ("tenant_id","prerequisite_module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD CONSTRAINT "lesson_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD CONSTRAINT "lesson_progress_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD CONSTRAINT "lesson_progress_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."learning_modules" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."learning_modules" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."learning_modules" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."learning_modules" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."learning_modules" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_progress" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_progress" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_progress" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_progress" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_progress" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lessons" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lessons" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lessons" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lessons" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lessons" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."module_classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."module_classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."module_classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."module_classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."module_classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);