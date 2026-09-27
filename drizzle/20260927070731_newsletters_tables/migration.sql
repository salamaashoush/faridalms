CREATE TABLE "core"."newsletter_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"newsletter_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"grade_descriptor_id" uuid,
	"grade_ns" text DEFAULT 'grade_level' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "newsletter_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "newsletter_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "newsletter_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "newsletter_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "newsletter_audiences_scope_check" CHECK (scope in ('school', 'staff', 'families', 'students', 'class', 'grade')),
	CONSTRAINT "newsletter_audiences_grade_ns_check" CHECK (grade_ns = 'grade_level'),
	CONSTRAINT "newsletter_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."newsletter_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."newsletter_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"newsletter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "newsletter_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "newsletter_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "newsletter_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "newsletter_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."newsletter_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."newsletters" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"primary_locale" text NOT NULL,
	"bilingual" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"revised_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "newsletters_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "newsletters_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "newsletters_version_check" CHECK (version > 0),
	CONSTRAINT "newsletters_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "newsletters_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "newsletters_primary_locale_check" CHECK (primary_locale in ('en', 'ar')),
	CONSTRAINT "newsletters_state_check" CHECK (state in ('draft', 'scheduled', 'published', 'archived')),
	CONSTRAINT "newsletters_publish_at_check" CHECK ((state in ('scheduled', 'published', 'archived')) = (publish_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."newsletters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "newsletter_audiences_newsletter_idx" ON "core"."newsletter_audiences" ("tenant_id","newsletter_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_recipients_key" ON "core"."newsletter_recipients" ("tenant_id","newsletter_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "newsletter_recipients_user_idx" ON "core"."newsletter_recipients" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "newsletters_org_idx" ON "core"."newsletters" ("tenant_id","org_id","publish_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."newsletter_audiences" ADD CONSTRAINT "newsletter_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."newsletter_audiences" ADD CONSTRAINT "newsletter_audiences_tenant_id_newsletter_id_fkey" FOREIGN KEY ("tenant_id","newsletter_id") REFERENCES "core"."newsletters"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."newsletter_audiences" ADD CONSTRAINT "newsletter_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."newsletter_audiences" ADD CONSTRAINT "newsletter_audiences_tenant_id_grade_descriptor_id_grade_n_fkey" FOREIGN KEY ("tenant_id","grade_descriptor_id","grade_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_tenant_id_newsletter_id_fkey" FOREIGN KEY ("tenant_id","newsletter_id") REFERENCES "core"."newsletters"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."newsletters" ADD CONSTRAINT "newsletters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."newsletters" ADD CONSTRAINT "newsletters_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."newsletters" ADD CONSTRAINT "newsletters_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."newsletter_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."newsletter_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."newsletter_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."newsletter_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."newsletter_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."newsletter_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."newsletter_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."newsletter_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."newsletter_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."newsletter_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."newsletters" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."newsletters" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."newsletters" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."newsletters" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."newsletters" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);