CREATE TABLE "core"."cmi5_registrations" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"progress" jsonb DEFAULT '{}' NOT NULL,
	"satisfied_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "cmi5_registrations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "cmi5_registrations_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "cmi5_registrations_version_check" CHECK (version > 0),
	CONSTRAINT "cmi5_registrations_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "cmi5_registrations_progress_check" CHECK (jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "core"."cmi5_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."cmi5_sessions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"registration_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"au_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"launched_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"fetched_at" timestamp with time zone,
	"last_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"verbs" jsonb DEFAULT '[]' NOT NULL,
	"ended_at" timestamp with time zone,
	"ending" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "cmi5_sessions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "cmi5_sessions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "cmi5_sessions_version_check" CHECK (version > 0),
	CONSTRAINT "cmi5_sessions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "cmi5_sessions_ids_check" CHECK (char_length(au_id) between 1 and 500 and char_length(activity_id) between 1 and 2000),
	CONSTRAINT "cmi5_sessions_verbs_check" CHECK (jsonb_typeof(verbs) = 'array' and jsonb_array_length(verbs) <= 20),
	CONSTRAINT "cmi5_sessions_ending_check" CHECK ((ended_at is null) = (ending is null)
        and (ending is null or ending in ('terminated', 'abandoned')))
);
--> statement-breakpoint
ALTER TABLE "core"."cmi5_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."cmi5_states" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"registration_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"activity_id" text NOT NULL,
	"state_id" text NOT NULL,
	"content_type" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "cmi5_states_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "cmi5_states_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "cmi5_states_version_check" CHECK (version > 0),
	CONSTRAINT "cmi5_states_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "cmi5_states_fields_check" CHECK (char_length(activity_id) between 1 and 2000 and char_length(state_id) between 1 and 500
        and char_length(content_type) between 1 and 200 and octet_length(body) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "core"."cmi5_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "cmi5_registrations_key" ON "core"."cmi5_registrations" ("tenant_id","lesson_id","package_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "cmi5_registrations_student_idx" ON "core"."cmi5_registrations" ("tenant_id","student_user_id");--> statement-breakpoint
CREATE INDEX "cmi5_sessions_open_idx" ON "core"."cmi5_sessions" ("tenant_id","registration_id","au_id") WHERE status = 'active' and ended_at is null;--> statement-breakpoint
CREATE INDEX "cmi5_sessions_student_idx" ON "core"."cmi5_sessions" ("tenant_id","student_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cmi5_states_key" ON "core"."cmi5_states" ("tenant_id","registration_id","activity_id","state_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "cmi5_states_student_idx" ON "core"."cmi5_states" ("tenant_id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_registrations" ADD CONSTRAINT "cmi5_registrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_registrations" ADD CONSTRAINT "cmi5_registrations_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_registrations" ADD CONSTRAINT "cmi5_registrations_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_registrations" ADD CONSTRAINT "cmi5_registrations_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_sessions" ADD CONSTRAINT "cmi5_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_sessions" ADD CONSTRAINT "cmi5_sessions_tenant_id_registration_id_fkey" FOREIGN KEY ("tenant_id","registration_id") REFERENCES "core"."cmi5_registrations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_sessions" ADD CONSTRAINT "cmi5_sessions_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_states" ADD CONSTRAINT "cmi5_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_states" ADD CONSTRAINT "cmi5_states_tenant_id_registration_id_fkey" FOREIGN KEY ("tenant_id","registration_id") REFERENCES "core"."cmi5_registrations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."cmi5_states" ADD CONSTRAINT "cmi5_states_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."cmi5_registrations" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."cmi5_registrations" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."cmi5_registrations" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."cmi5_registrations" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."cmi5_registrations" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."cmi5_registrations" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."cmi5_registrations" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."cmi5_sessions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."cmi5_sessions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."cmi5_sessions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."cmi5_sessions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."cmi5_sessions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."cmi5_sessions" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."cmi5_sessions" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."cmi5_states" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."cmi5_states" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."cmi5_states" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."cmi5_states" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."cmi5_states" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."cmi5_states" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."cmi5_states" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));