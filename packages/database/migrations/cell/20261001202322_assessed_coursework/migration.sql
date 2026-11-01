CREATE TABLE "core"."attempt_authentications" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"attempt_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"teacher_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attempt_authentications_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attempt_authentications_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attempt_authentications_version_check" CHECK (version > 0),
	CONSTRAINT "attempt_authentications_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attempt_authentications_outcome_check" CHECK (outcome in ('confirmed', 'not_confirmed')),
	CONSTRAINT "attempt_authentications_note_check" CHECK (char_length(note) between 1 and 2000),
	CONSTRAINT "attempt_authentications_reason_check" CHECK (outcome = 'confirmed' or note is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."attempt_authentications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."attempt_declarations" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"attempt_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"statement" text NOT NULL,
	"ai_used" boolean,
	"recorded_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attempt_declarations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attempt_declarations_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attempt_declarations_version_check" CHECK (version > 0),
	CONSTRAINT "attempt_declarations_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attempt_declarations_kind_check" CHECK (kind in ('student', 'paper')),
	CONSTRAINT "attempt_declarations_statement_check" CHECK (statement ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "attempt_declarations_ai_used_check" CHECK ((kind = 'student') = (ai_used is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."attempt_declarations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."coursework_assessments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"component" text,
	"set_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "coursework_assessments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "coursework_assessments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "coursework_assessments_version_check" CHECK (version > 0),
	CONSTRAINT "coursework_assessments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "coursework_assessments_component_check" CHECK (char_length(component) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "core"."coursework_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_authentications_attempt_key" ON "core"."attempt_authentications" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_declarations_attempt_key" ON "core"."attempt_declarations" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "coursework_assessments_assignment_key" ON "core"."coursework_assessments" ("tenant_id","assignment_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "coursework_assessments_session_idx" ON "core"."coursework_assessments" ("tenant_id","session_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."attempt_authentications" ADD CONSTRAINT "attempt_authentications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attempt_authentications" ADD CONSTRAINT "attempt_authentications_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attempt_authentications" ADD CONSTRAINT "attempt_authentications_tenant_id_teacher_user_id_fkey" FOREIGN KEY ("tenant_id","teacher_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attempt_declarations" ADD CONSTRAINT "attempt_declarations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attempt_declarations" ADD CONSTRAINT "attempt_declarations_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attempt_declarations" ADD CONSTRAINT "attempt_declarations_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attempt_declarations" ADD CONSTRAINT "attempt_declarations_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."coursework_assessments" ADD CONSTRAINT "coursework_assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."coursework_assessments" ADD CONSTRAINT "coursework_assessments_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."coursework_assessments" ADD CONSTRAINT "coursework_assessments_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id","session_id") REFERENCES "core"."exam_sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."coursework_assessments" ADD CONSTRAINT "coursework_assessments_tenant_id_set_by_user_id_fkey" FOREIGN KEY ("tenant_id","set_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attempt_authentications" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attempt_authentications" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attempt_authentications" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attempt_authentications" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attempt_authentications" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attempt_declarations" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attempt_declarations" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attempt_declarations" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attempt_declarations" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attempt_declarations" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."coursework_assessments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."coursework_assessments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."coursework_assessments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."coursework_assessments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."coursework_assessments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);