ALTER TABLE "core"."site_posts" DROP CONSTRAINT "site_posts_tenant_id_cover_file_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."site_posts" DROP CONSTRAINT "site_posts_cover_alt_check";--> statement-breakpoint
ALTER TABLE "core"."site_posts" DROP COLUMN "cover_file_id";--> statement-breakpoint
ALTER TABLE "core"."site_posts" DROP COLUMN "cover_alt_en";--> statement-breakpoint
ALTER TABLE "core"."site_posts" DROP COLUMN "cover_alt_ar";