CREATE TYPE "site_locale" AS ENUM('en', 'ar');--> statement-breakpoint
CREATE TYPE "site_publication_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "file_purpose" ADD VALUE 'site_media';--> statement-breakpoint
ALTER TYPE "permission" ADD VALUE 'site:manage' BEFORE 'reports:read';--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY,
	"slug" varchar(80) NOT NULL,
	"locale" "site_locale" NOT NULL,
	"title" varchar(160) NOT NULL,
	"summary" varchar(500) DEFAULT '' NOT NULL,
	"nav_group" varchar(60) DEFAULT '' NOT NULL,
	"nav_order" integer DEFAULT 0 NOT NULL,
	"show_in_nav" boolean DEFAULT true NOT NULL,
	"document" jsonb NOT NULL,
	"published" jsonb,
	"status" "site_publication_status" DEFAULT 'draft'::"site_publication_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_slug_locale_key" UNIQUE("slug","locale"),
	CONSTRAINT "site_pages_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "site_post_categories" (
	"id" uuid PRIMARY KEY,
	"slug" varchar(80) NOT NULL UNIQUE,
	"name" varchar(80) NOT NULL,
	"name_ar" varchar(80) DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_post_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"post_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" varchar(500) DEFAULT '' NOT NULL,
	"document" jsonb NOT NULL,
	"saved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_post_revisions_key" UNIQUE("post_id","revision")
);
--> statement-breakpoint
CREATE TABLE "site_posts" (
	"id" uuid PRIMARY KEY,
	"slug" varchar(80) NOT NULL,
	"locale" "site_locale" NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" varchar(500) DEFAULT '' NOT NULL,
	"document" jsonb NOT NULL,
	"category_id" uuid,
	"cover_file_id" uuid,
	"author_id" uuid,
	"updated_by_id" uuid,
	"status" "site_publication_status" DEFAULT 'draft'::"site_publication_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"publish_at" timestamp with time zone,
	"published" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_posts_slug_locale_key" UNIQUE("slug","locale"),
	CONSTRAINT "site_posts_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slot" smallint DEFAULT 1 NOT NULL CONSTRAINT "site_settings_slot_key" UNIQUE,
	"tagline" varchar(255) DEFAULT '' NOT NULL,
	"tagline_ar" varchar(255) DEFAULT '' NOT NULL,
	"primary_color" varchar(7) DEFAULT '#0f766e' NOT NULL,
	"logo_file_id" uuid,
	"contact_email" varchar(255) DEFAULT '' NOT NULL,
	"contact_phone" varchar(40) DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"map_url" text DEFAULT '' NOT NULL,
	"social_links" jsonb DEFAULT '[]' NOT NULL,
	"default_locale" "site_locale" DEFAULT 'en'::"site_locale" NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_slot_check" CHECK ("slot" = 1),
	CONSTRAINT "site_settings_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "site_pages_nav_idx" ON "site_pages" ("locale","status","nav_order");--> statement-breakpoint
CREATE INDEX "site_post_categories_order_idx" ON "site_post_categories" ("sort_order");--> statement-breakpoint
CREATE INDEX "site_posts_public_idx" ON "site_posts" ("locale","status","publish_at");--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_post_revisions" ADD CONSTRAINT "site_post_revisions_post_id_site_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "site_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "site_post_revisions" ADD CONSTRAINT "site_post_revisions_saved_by_id_users_id_fkey" FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_category_id_site_post_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "site_post_categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_cover_file_id_private_files_id_fkey" FOREIGN KEY ("cover_file_id") REFERENCES "private_files"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_logo_file_id_private_files_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "private_files"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;