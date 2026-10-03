ALTER TABLE "core"."site_posts" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD COLUMN "cover_alt_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD COLUMN "cover_alt_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_cover_file_id_fkey" FOREIGN KEY ("tenant_id","cover_file_id") REFERENCES "core"."files"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_cover_alt_check" CHECK (char_length(cover_alt_en) <= 300 and char_length(cover_alt_ar) <= 300);