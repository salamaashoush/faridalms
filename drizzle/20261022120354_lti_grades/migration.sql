CREATE TABLE "core"."lti_line_items" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"tool_id" uuid NOT NULL,
	"module_id" uuid,
	"class_id" uuid,
	"lesson_id" uuid,
	"assignment_id" uuid,
	"link_id" uuid,
	"declared" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"score_maximum" numeric(12,4) NOT NULL,
	"resource_id" text,
	"tag" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"grades_released" boolean,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lti_line_items_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lti_line_items_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lti_line_items_version_check" CHECK (version > 0),
	CONSTRAINT "lti_line_items_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lti_line_items_course_check" CHECK (num_nonnulls(module_id, class_id) = 1
        and (lesson_id is null or module_id is not null)
        and (assignment_id is null or class_id is not null)),
	CONSTRAINT "lti_line_items_link_check" CHECK ((link_id is null) = (lesson_id is null and assignment_id is null)
        and (not declared or link_id is not null)),
	CONSTRAINT "lti_line_items_fields_check" CHECK (char_length(label) between 1 and 200 and score_maximum > 0
        and char_length(coalesce(resource_id, '')) <= 255 and char_length(coalesce(tag, '')) <= 255
        and (starts_at is null or ends_at is null or starts_at <= ends_at))
);
--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lti_scores" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"line_item_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"score_given" numeric(12,4),
	"score_maximum" numeric(12,4),
	"comment" text,
	"activity_progress" text NOT NULL,
	"grading_progress" text NOT NULL,
	"scored_at" timestamp with time zone NOT NULL,
	"scoring_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lti_scores_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lti_scores_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lti_scores_version_check" CHECK (version > 0),
	CONSTRAINT "lti_scores_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lti_scores_score_check" CHECK ((score_given is null or (score_given >= 0 and score_maximum > 0))
        and char_length(coalesce(comment, '')) <= 4000),
	CONSTRAINT "lti_scores_progress_check" CHECK (activity_progress in ('Initialized', 'Started', 'InProgress', 'Submitted', 'Completed')
        and grading_progress in ('FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady'))
);
--> statement-breakpoint
ALTER TABLE "core"."lti_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "lti_line_items_lesson_link_key" ON "core"."lti_line_items" ("tenant_id","tool_id","lesson_id","link_id") WHERE declared and lesson_id is not null and status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lti_line_items_assignment_link_key" ON "core"."lti_line_items" ("tenant_id","tool_id","assignment_id","link_id") WHERE declared and assignment_id is not null and status = 'active';--> statement-breakpoint
CREATE INDEX "lti_line_items_module_idx" ON "core"."lti_line_items" ("tenant_id","tool_id","module_id") WHERE module_id is not null and status = 'active';--> statement-breakpoint
CREATE INDEX "lti_line_items_class_idx" ON "core"."lti_line_items" ("tenant_id","tool_id","class_id") WHERE class_id is not null and status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lti_scores_key" ON "core"."lti_scores" ("tenant_id","line_item_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lti_scores_student_idx" ON "core"."lti_scores" ("tenant_id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_tenant_id_tool_id_fkey" FOREIGN KEY ("tenant_id","tool_id") REFERENCES "core"."lti_tools"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_scores" ADD CONSTRAINT "lti_scores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lti_scores" ADD CONSTRAINT "lti_scores_tenant_id_line_item_id_fkey" FOREIGN KEY ("tenant_id","line_item_id") REFERENCES "core"."lti_line_items"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_scores" ADD CONSTRAINT "lti_scores_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_scores" ADD CONSTRAINT "lti_scores_tenant_id_scoring_user_id_fkey" FOREIGN KEY ("tenant_id","scoring_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lti_line_items" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lti_line_items" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lti_line_items" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lti_line_items" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lti_line_items" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lti_scores" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lti_scores" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lti_scores" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lti_scores" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lti_scores" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lti_scores" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lti_scores" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));