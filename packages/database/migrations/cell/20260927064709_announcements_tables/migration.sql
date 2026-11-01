CREATE TABLE "core"."announcement_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"announcement_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"grade_descriptor_id" uuid,
	"grade_ns" text DEFAULT 'grade_level' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "announcement_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "announcement_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "announcement_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "announcement_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "announcement_audiences_scope_check" CHECK (scope in ('school', 'staff', 'families', 'students', 'class', 'grade')),
	CONSTRAINT "announcement_audiences_grade_ns_check" CHECK (grade_ns = 'grade_level'),
	CONSTRAINT "announcement_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."announcement_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."announcement_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "announcement_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "announcement_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "announcement_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."announcements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"pinned_until" date,
	"expires_on" date,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"ack_due_on" date,
	"author_user_id" uuid NOT NULL,
	"update_sent_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "announcements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "announcements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "announcements_version_check" CHECK (version > 0),
	CONSTRAINT "announcements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "announcements_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "announcements_urgency_check" CHECK (urgency in ('normal', 'important', 'urgent')),
	CONSTRAINT "announcements_state_check" CHECK (state in ('draft', 'scheduled', 'published', 'archived')),
	CONSTRAINT "announcements_publish_at_check" CHECK ((state in ('scheduled', 'published', 'archived')) = (publish_at is not null)),
	CONSTRAINT "announcements_ack_due_on_check" CHECK (ack_due_on is null or requires_ack)
);
--> statement-breakpoint
ALTER TABLE "core"."announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "announcement_audiences_announcement_idx" ON "core"."announcement_audiences" ("tenant_id","announcement_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_recipients_key" ON "core"."announcement_recipients" ("tenant_id","announcement_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "announcement_recipients_user_idx" ON "core"."announcement_recipients" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "announcements_org_idx" ON "core"."announcements" ("tenant_id","org_id","publish_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."announcement_audiences" ADD CONSTRAINT "announcement_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."announcement_audiences" ADD CONSTRAINT "announcement_audiences_tenant_id_announcement_id_fkey" FOREIGN KEY ("tenant_id","announcement_id") REFERENCES "core"."announcements"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."announcement_audiences" ADD CONSTRAINT "announcement_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."announcement_audiences" ADD CONSTRAINT "announcement_audiences_tenant_id_grade_descriptor_id_grade_fkey" FOREIGN KEY ("tenant_id","grade_descriptor_id","grade_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" ADD CONSTRAINT "announcement_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" ADD CONSTRAINT "announcement_recipients_tenant_id_announcement_id_fkey" FOREIGN KEY ("tenant_id","announcement_id") REFERENCES "core"."announcements"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" ADD CONSTRAINT "announcement_recipients_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."announcement_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."announcement_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."announcement_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."announcement_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."announcement_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."announcement_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."announcement_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."announcement_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."announcement_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."announcement_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."announcements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."announcements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."announcements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."announcements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."announcements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);