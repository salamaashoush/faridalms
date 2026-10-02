CREATE TABLE "core"."site_post_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"post_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"grade_descriptor_id" uuid,
	"grade_ns" text DEFAULT 'grade_level' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_post_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_post_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_post_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "site_post_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_post_audiences_scope_check" CHECK (scope in ('school', 'staff', 'families', 'students', 'class', 'grade')),
	CONSTRAINT "site_post_audiences_grade_ns_check" CHECK (grade_ns = 'grade_level'),
	CONSTRAINT "site_post_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_post_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_post_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_post_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_post_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "site_post_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."site_post_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD COLUMN "translation_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD COLUMN "translation_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD COLUMN "translation_source_digest" text;--> statement-breakpoint
CREATE INDEX "site_post_audiences_post_idx" ON "core"."site_post_audiences" ("tenant_id","post_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_post_recipients_key" ON "core"."site_post_recipients" ("tenant_id","post_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_post_recipients_user_idx" ON "core"."site_post_recipients" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" ADD CONSTRAINT "site_post_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" ADD CONSTRAINT "site_post_audiences_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."site_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" ADD CONSTRAINT "site_post_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" ADD CONSTRAINT "site_post_audiences_tenant_id_grade_descriptor_id_grade_ns_fkey" FOREIGN KEY ("tenant_id","grade_descriptor_id","grade_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."site_post_recipients" ADD CONSTRAINT "site_post_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_post_recipients" ADD CONSTRAINT "site_post_recipients_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."site_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_post_recipients" ADD CONSTRAINT "site_post_recipients_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_visibility_check" CHECK (visibility in ('public', 'school'));--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_post_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_post_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_post_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_post_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_post_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_post_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_post_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_post_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_post_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_post_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);