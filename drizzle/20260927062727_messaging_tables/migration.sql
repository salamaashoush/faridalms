CREATE TABLE "core"."message_threads" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text,
	"student_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "message_threads_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "message_threads_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "message_threads_version_check" CHECK (version > 0),
	CONSTRAINT "message_threads_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "message_threads_kind_check" CHECK (kind in ('direct', 'group', 'family')),
	CONSTRAINT "message_threads_subject_check" CHECK (char_length(subject) between 1 and 200),
	CONSTRAINT "message_threads_student_check" CHECK ((kind = 'family') = (student_user_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."message_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."messages" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "messages_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "messages_tenant_id_id_thread_id_key" UNIQUE("tenant_id","id","thread_id"),
	CONSTRAINT "messages_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "messages_version_check" CHECK (version > 0),
	CONSTRAINT "messages_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "messages_body_check" CHECK (char_length(body) between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "core"."messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."thread_members" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"draft" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "thread_members_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "thread_members_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "thread_members_version_check" CHECK (version > 0),
	CONSTRAINT "thread_members_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "thread_members_role_check" CHECK (role in ('owner', 'member')),
	CONSTRAINT "thread_members_draft_check" CHECK (char_length(draft) <= 5000),
	CONSTRAINT "thread_members_left_at_check" CHECK (left_at is null or left_at >= joined_at)
);
--> statement-breakpoint
ALTER TABLE "core"."thread_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "message_threads_org_idx" ON "core"."message_threads" ("tenant_id","org_id","last_message_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "core"."messages" ("tenant_id","thread_id","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "thread_members_key" ON "core"."thread_members" ("tenant_id","thread_id","user_id") WHERE status = 'active' and left_at is null;--> statement-breakpoint
CREATE INDEX "thread_members_user_idx" ON "core"."thread_members" ("tenant_id","user_id") WHERE status = 'active' and left_at is null;--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."message_threads" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."message_threads" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."message_threads" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."message_threads" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."message_threads" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."messages" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."messages" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."messages" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."messages" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."messages" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."thread_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."thread_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."thread_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."thread_members" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."thread_members" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);