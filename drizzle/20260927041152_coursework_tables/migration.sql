CREATE TABLE "core"."assessments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"attempt_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"score" numeric(7,2),
	"effective_score" numeric(7,2),
	"rubric_scores" jsonb,
	"feedback" text,
	"private_note" text,
	"graded_by_user_id" uuid NOT NULL,
	"graded_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"released_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assessments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assessments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assessments_version_check" CHECK (version > 0),
	CONSTRAINT "assessments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assessments_score_check" CHECK (score is null or score >= 0),
	CONSTRAINT "assessments_effective_score_check" CHECK (effective_score is null or effective_score >= 0),
	CONSTRAINT "assessments_rubric_scores_check" CHECK (rubric_scores is null or jsonb_typeof(rubric_scores) = 'object'),
	CONSTRAINT "assessments_feedback_check" CHECK (char_length(feedback) between 1 and 10000),
	CONSTRAINT "assessments_private_note_check" CHECK (char_length(private_note) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assignment_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"group_id" uuid,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assignment_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assignment_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "assignment_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assignment_recipients_source_check" CHECK (source in ('class', 'group', 'student')),
	CONSTRAINT "assignment_recipients_group_check" CHECK ((source = 'group') = (group_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assignments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_type" text NOT NULL,
	"school_year_id" uuid NOT NULL,
	"grading_period_id" uuid,
	"author_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"audience" text DEFAULT 'class' NOT NULL,
	"available_from" timestamp with time zone,
	"due_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"late_policy" text DEFAULT 'accept' NOT NULL,
	"late_deduction_percent" smallint,
	"submission_format" text DEFAULT 'both' NOT NULL,
	"max_files" smallint DEFAULT 5 NOT NULL,
	"resubmission" boolean DEFAULT false NOT NULL,
	"points" numeric(7,2),
	"rubric" jsonb,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assignments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assignments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assignments_version_check" CHECK (version > 0),
	CONSTRAINT "assignments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assignments_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "assignments_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "assignments_audience_check" CHECK (audience in ('class', 'selected')),
	CONSTRAINT "assignments_late_policy_check" CHECK (late_policy in ('accept', 'deduct', 'refuse')),
	CONSTRAINT "assignments_late_deduction_check" CHECK ((late_policy = 'deduct') = (late_deduction_percent is not null) and (late_deduction_percent is null or late_deduction_percent between 1 and 100)),
	CONSTRAINT "assignments_submission_format_check" CHECK (submission_format in ('online', 'files', 'both', 'none')),
	CONSTRAINT "assignments_max_files_check" CHECK (max_files between 1 and 20),
	CONSTRAINT "assignments_points_check" CHECK (points is null or points > 0),
	CONSTRAINT "assignments_rubric_check" CHECK (rubric is null or (jsonb_typeof(rubric) = 'object' and octet_length(rubric::text) <= 65536)),
	CONSTRAINT "assignments_dates_check" CHECK ((available_from is null or due_at is null or due_at >= available_from) and (due_at is null or closes_at is null or closes_at >= due_at) and (available_from is null or closes_at is null or closes_at >= available_from)),
	CONSTRAINT "assignments_published_check" CHECK (state = 'draft' or published_at is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_group_members" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"group_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_group_members_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_group_members_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_group_members_version_check" CHECK (version > 0),
	CONSTRAINT "class_group_members_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_groups" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_type" text NOT NULL,
	"school_year_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"created_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_groups_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_groups_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_groups_version_check" CHECK (version > 0),
	CONSTRAINT "class_groups_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_groups_title_en_check" CHECK (char_length(title_en) between 1 and 80),
	CONSTRAINT "class_groups_title_ar_check" CHECK (char_length(title_ar) between 1 and 80),
	CONSTRAINT "class_groups_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."class_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."period_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_type" text NOT NULL,
	"school_year_id" uuid NOT NULL,
	"grading_period_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"score" numeric(7,2),
	"max_score" numeric(7,2) DEFAULT '100' NOT NULL,
	"comment" text,
	"recorded_by_user_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "period_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "period_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "period_grades_version_check" CHECK (version > 0),
	CONSTRAINT "period_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "period_grades_max_score_check" CHECK (max_score > 0),
	CONSTRAINT "period_grades_score_check" CHECK (score is null or (score >= 0 and score <= max_score)),
	CONSTRAINT "period_grades_comment_check" CHECK (char_length(comment) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."period_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."rubrics" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "rubrics_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "rubrics_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "rubrics_version_check" CHECK (version > 0),
	CONSTRAINT "rubrics_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "rubrics_title_check" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "rubrics_criteria_check" CHECK (jsonb_typeof(criteria) = 'object' and octet_length(criteria::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "core"."rubrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."submission_attempts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"is_late" boolean NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "submission_attempts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "submission_attempts_tenant_id_id_submission_id_key" UNIQUE("tenant_id","id","submission_id"),
	CONSTRAINT "submission_attempts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "submission_attempts_version_check" CHECK (version > 0),
	CONSTRAINT "submission_attempts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "submission_attempts_number_check" CHECK (number between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."submissions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"excused" boolean DEFAULT false NOT NULL,
	"needs_revision" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "submissions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "submissions_tenant_id_id_student_user_id_key" UNIQUE("tenant_id","id","student_user_id"),
	CONSTRAINT "submissions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "submissions_version_check" CHECK (version > 0),
	CONSTRAINT "submissions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "submissions_state_check" CHECK (state in ('draft', 'submitted', 'returned'))
);
--> statement-breakpoint
ALTER TABLE "core"."submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_attempt_key" ON "core"."assessments" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_recipients_key" ON "core"."assignment_recipients" ("tenant_id","assignment_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assignment_recipients_student_idx" ON "core"."assignment_recipients" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assignments_class_idx" ON "core"."assignments" ("tenant_id","class_id","state") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assignments_year_idx" ON "core"."assignments" ("tenant_id","org_id","school_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "class_group_members_key" ON "core"."class_group_members" ("tenant_id","group_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_groups_class_idx" ON "core"."class_groups" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "period_grades_key" ON "core"."period_grades" ("tenant_id","class_id","grading_period_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "rubrics_owner_idx" ON "core"."rubrics" ("tenant_id","owner_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "submission_attempts_number_key" ON "core"."submission_attempts" ("tenant_id","submission_id","number") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_key" ON "core"."submissions" ("tenant_id","assignment_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "submissions_student_idx" ON "core"."submissions" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_attempt_id_submission_id_fkey" FOREIGN KEY ("tenant_id","attempt_id","submission_id") REFERENCES "core"."submission_attempts"("tenant_id","id","submission_id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_graded_by_user_id_fkey" FOREIGN KEY ("tenant_id","graded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id","group_id") REFERENCES "core"."class_groups"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_class_id_class_type_school_year_id_o_fkey" FOREIGN KEY ("tenant_id","class_id","class_type","school_year_id","org_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_grading_period_id_fkey" FOREIGN KEY ("tenant_id","grading_period_id") REFERENCES "core"."academic_sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id","group_id") REFERENCES "core"."class_groups"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_groups" ADD CONSTRAINT "class_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_groups" ADD CONSTRAINT "class_groups_tenant_id_class_id_class_type_school_year_id__fkey" FOREIGN KEY ("tenant_id","class_id","class_type","school_year_id","org_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_groups" ADD CONSTRAINT "class_groups_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_class_id_class_type_school_year_id_fkey" FOREIGN KEY ("tenant_id","class_id","class_type","school_year_id","org_id") REFERENCES "core"."classes"("tenant_id","id","class_type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_grading_period_id_fkey" FOREIGN KEY ("tenant_id","grading_period_id") REFERENCES "core"."academic_sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."rubrics" ADD CONSTRAINT "rubrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."rubrics" ADD CONSTRAINT "rubrics_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ADD CONSTRAINT "submission_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ADD CONSTRAINT "submission_attempts_tenant_id_submission_id_student_user_i_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ADD CONSTRAINT "submission_attempts_tenant_id_submitted_by_user_id_fkey" FOREIGN KEY ("tenant_id","submitted_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."submissions" ADD CONSTRAINT "submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."submissions" ADD CONSTRAINT "submissions_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."submissions" ADD CONSTRAINT "submissions_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assessments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assessments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assessments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assessments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assessments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."assessments" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assignment_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assignment_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assignment_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assignment_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assignment_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assignments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assignments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assignments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assignments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assignments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."assignments" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_group_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_group_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_group_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_group_members" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_group_members" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_groups" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_groups" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_groups" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_groups" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_groups" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."period_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."period_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."period_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."period_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."period_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."period_grades" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."rubrics" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."rubrics" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."rubrics" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."rubrics" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."rubrics" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."submission_attempts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."submission_attempts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."submission_attempts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."submission_attempts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."submission_attempts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."submissions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."submissions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."submissions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."submissions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."submissions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);