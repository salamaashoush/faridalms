CREATE TABLE "core"."site_categories" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_categories_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_categories_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_categories_version_check" CHECK (version > 0),
	CONSTRAINT "site_categories_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_categories_slug_check" CHECK (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "site_categories_name_check" CHECK (char_length(name_en) <= 100 and char_length(name_ar) <= 100 and (name_en <> '' or name_ar <> '')),
	CONSTRAINT "site_categories_position_check" CHECK (position between 0 and 999)
);
--> statement-breakpoint
ALTER TABLE "core"."site_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_pages" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	"slug" text NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"in_menu" boolean DEFAULT true NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revised_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_pages_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_pages_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_pages_version_check" CHECK (version > 0),
	CONSTRAINT "site_pages_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_pages_parent_check" CHECK (parent_id is null or parent_id <> id),
	CONSTRAINT "site_pages_position_check" CHECK (position between 0 and 999),
	CONSTRAINT "site_pages_slug_check" CHECK (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "site_pages_title_check" CHECK (char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')),
	CONSTRAINT "site_pages_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "site_pages_published_at_check" CHECK ((state = 'published') = (published_at is not null)),
	CONSTRAINT "site_pages_home_check" CHECK (not is_home or parent_id is null)
);
--> statement-breakpoint
ALTER TABLE "core"."site_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_posts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"category_id" uuid,
	"slug" text NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"excerpt_en" text DEFAULT '' NOT NULL,
	"excerpt_ar" text DEFAULT '' NOT NULL,
	"cover_file_id" uuid,
	"cover_alt_en" text DEFAULT '' NOT NULL,
	"cover_alt_ar" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revised_at" timestamp with time zone,
	"announcement_id" uuid,
	"author_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_posts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_posts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_posts_version_check" CHECK (version > 0),
	CONSTRAINT "site_posts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_posts_slug_check" CHECK (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "site_posts_title_check" CHECK (char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')),
	CONSTRAINT "site_posts_excerpt_check" CHECK (char_length(excerpt_en) <= 300 and char_length(excerpt_ar) <= 300),
	CONSTRAINT "site_posts_cover_alt_check" CHECK (char_length(cover_alt_en) <= 300 and char_length(cover_alt_ar) <= 300),
	CONSTRAINT "site_posts_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "site_posts_published_at_check" CHECK ((state = 'published') = (published_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."site_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_published_pages" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"page_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"position" smallint NOT NULL,
	"is_home" boolean NOT NULL,
	"in_menu" boolean NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"media" jsonb DEFAULT '{}' NOT NULL,
	"visible_from" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_published_pages_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_published_pages_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_published_pages_version_check" CHECK (version > 0),
	CONSTRAINT "site_published_pages_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_published_pages_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_published_pages_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "site_published_pages_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576),
	CONSTRAINT "site_published_pages_media_check" CHECK (jsonb_typeof(media) = 'object')
);
--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_published_posts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"post_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"cover_key" text,
	"cover_alt" text DEFAULT '' NOT NULL,
	"pinned" boolean NOT NULL,
	"content" jsonb NOT NULL,
	"media" jsonb DEFAULT '{}' NOT NULL,
	"visible_from" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_published_posts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_published_posts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_published_posts_version_check" CHECK (version > 0),
	CONSTRAINT "site_published_posts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_published_posts_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_published_posts_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "site_published_posts_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576),
	CONSTRAINT "site_published_posts_media_check" CHECK (jsonb_typeof(media) = 'object')
);
--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"primary_locale" text DEFAULT 'en' NOT NULL,
	"bilingual" boolean DEFAULT true NOT NULL,
	"tagline_en" text DEFAULT '' NOT NULL,
	"tagline_ar" text DEFAULT '' NOT NULL,
	"social_links" jsonb DEFAULT '[]' NOT NULL,
	"banner_en" text DEFAULT '' NOT NULL,
	"banner_ar" text DEFAULT '' NOT NULL,
	"banner_tone" text DEFAULT 'info' NOT NULL,
	"banner_until" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_settings_version_check" CHECK (version > 0),
	CONSTRAINT "site_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_settings_primary_locale_check" CHECK (primary_locale in ('en', 'ar')),
	CONSTRAINT "site_settings_tagline_en_check" CHECK (char_length(tagline_en) <= 200),
	CONSTRAINT "site_settings_tagline_ar_check" CHECK (char_length(tagline_ar) <= 200),
	CONSTRAINT "site_settings_social_links_check" CHECK (jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 10),
	CONSTRAINT "site_settings_banner_en_check" CHECK (char_length(banner_en) <= 300),
	CONSTRAINT "site_settings_banner_ar_check" CHECK (char_length(banner_ar) <= 300),
	CONSTRAINT "site_settings_banner_tone_check" CHECK (banner_tone in ('info', 'warning', 'danger'))
);
--> statement-breakpoint
ALTER TABLE "core"."site_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "site_categories_slug_key" ON "core"."site_categories" ("tenant_id","org_id","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_slug_key" ON "core"."site_pages" ("tenant_id","org_id","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_home_key" ON "core"."site_pages" ("tenant_id","org_id") WHERE status = 'active' and is_home;--> statement-breakpoint
CREATE INDEX "site_pages_tree_idx" ON "core"."site_pages" ("tenant_id","org_id","parent_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_posts_slug_key" ON "core"."site_posts" ("tenant_id","org_id","slug") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_posts_org_idx" ON "core"."site_posts" ("tenant_id","org_id","published_at") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_published_pages_key" ON "core"."site_published_pages" ("tenant_id","page_id","locale") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_published_pages_slug_idx" ON "core"."site_published_pages" ("tenant_id","org_id","locale","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_published_posts_key" ON "core"."site_published_posts" ("tenant_id","post_id","locale") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_published_posts_org_idx" ON "core"."site_published_posts" ("tenant_id","org_id","locale","visible_from") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_settings_org_key" ON "core"."site_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."site_categories" ADD CONSTRAINT "site_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_categories" ADD CONSTRAINT "site_categories_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "core"."site_pages"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."site_categories"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_cover_file_id_fkey" FOREIGN KEY ("tenant_id","cover_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_announcement_id_fkey" FOREIGN KEY ("tenant_id","announcement_id") REFERENCES "core"."announcements"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_tenant_id_page_id_fkey" FOREIGN KEY ("tenant_id","page_id") REFERENCES "core"."site_pages"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."site_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."site_categories"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD CONSTRAINT "site_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD CONSTRAINT "site_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_categories" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_categories" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_categories" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_categories" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_categories" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_categories" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_pages" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_pages" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_pages" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_pages" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_pages" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_posts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_posts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_posts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_posts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_posts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_published_pages" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_published_pages" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_published_pages" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_published_pages" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_published_pages" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_published_pages" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and visible_from <= statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_published_posts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_published_posts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_published_posts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_published_posts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_published_posts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_published_posts" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and visible_from <= statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_settings" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');