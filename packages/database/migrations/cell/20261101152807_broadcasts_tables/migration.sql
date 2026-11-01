CREATE TABLE "core"."broadcast_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"broadcast_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"grade_descriptor_id" uuid,
	"grade_ns" text DEFAULT 'grade_level' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcast_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcast_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcast_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "broadcast_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "broadcast_audiences_scope_check" CHECK (scope in ('school', 'staff', 'families', 'students', 'class', 'grade')),
	CONSTRAINT "broadcast_audiences_grade_ns_check" CHECK (grade_ns = 'grade_level'),
	CONSTRAINT "broadcast_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."broadcast_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcast_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcast_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "broadcast_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."broadcasts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"told_at" timestamp with time zone,
	"visibility" text DEFAULT 'school' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"translation_reviewed_at" timestamp with time zone,
	"translation_reviewed_by_user_id" uuid,
	"translation_source_digest" text,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"pinned_until" date,
	"expires_on" date,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"ack_due_on" date,
	"update_sent_at" timestamp with time zone,
	"category_id" uuid,
	"slug" text,
	"excerpt_en" text DEFAULT '' NOT NULL,
	"excerpt_ar" text DEFAULT '' NOT NULL,
	"cover_file_id" uuid,
	"cover_alt_en" text DEFAULT '' NOT NULL,
	"cover_alt_ar" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcasts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcasts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcasts_version_check" CHECK (version > 0),
	CONSTRAINT "broadcasts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "broadcasts_kind_check" CHECK (kind in ('announcement', 'news')),
	CONSTRAINT "broadcasts_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "broadcasts_publish_at_check" CHECK ((state <> 'published' or publish_at is not null) and (state <> 'draft' or publish_at is null)),
	CONSTRAINT "broadcasts_told_at_check" CHECK (told_at is null or state <> 'draft'),
	CONSTRAINT "broadcasts_visibility_check" CHECK (visibility in ('public', 'school')),
	CONSTRAINT "broadcasts_title_check" CHECK (char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')),
	CONSTRAINT "broadcasts_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)),
	CONSTRAINT "broadcasts_urgency_check" CHECK (urgency in ('normal', 'important', 'urgent')),
	CONSTRAINT "broadcasts_ack_due_on_check" CHECK (ack_due_on is null or requires_ack),
	CONSTRAINT "broadcasts_announcement_check" CHECK (kind = 'announcement' or (urgency = 'normal' and pinned_until is null and expires_on is null and not requires_ack and update_sent_at is null)),
	CONSTRAINT "broadcasts_news_check" CHECK ((kind = 'news') = (slug is not null) and (kind = 'news' or (visibility = 'school' and category_id is null and excerpt_en = '' and excerpt_ar = '' and cover_file_id is null and cover_alt_en = '' and cover_alt_ar = '' and not pinned))),
	CONSTRAINT "broadcasts_slug_check" CHECK (slug is null or (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
	CONSTRAINT "broadcasts_excerpt_check" CHECK (char_length(excerpt_en) <= 300 and char_length(excerpt_ar) <= 300),
	CONSTRAINT "broadcasts_cover_alt_check" CHECK (char_length(cover_alt_en) <= 300 and char_length(cover_alt_ar) <= 300)
);
--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "broadcast_audiences_broadcast_idx" ON "core"."broadcast_audiences" ("tenant_id","broadcast_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_recipients_key" ON "core"."broadcast_recipients" ("tenant_id","broadcast_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcast_recipients_user_idx" ON "core"."broadcast_recipients" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "broadcasts_slug_key" ON "core"."broadcasts" ("tenant_id","org_id","slug") WHERE status = 'active' and slug is not null;--> statement-breakpoint
CREATE INDEX "broadcasts_org_idx" ON "core"."broadcasts" ("tenant_id","org_id","kind","publish_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcasts_untold_idx" ON "core"."broadcasts" ("tenant_id","publish_at") WHERE status = 'active' and state = 'published' and told_at is null;--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_grade_descriptor_id_grade_ns_fkey" FOREIGN KEY ("tenant_id","grade_descriptor_id","grade_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."site_categories"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_cover_file_id_fkey" FOREIGN KEY ("tenant_id","cover_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcast_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcast_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcast_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcast_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcast_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcast_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcast_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcast_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcast_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcast_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcasts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcasts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcasts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcasts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcasts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);