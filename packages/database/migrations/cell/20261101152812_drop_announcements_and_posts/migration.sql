-- Dropping the tables drops their policies and grants with them; the
-- website copies' key to the broadcasts moved in the migration before.
ALTER TABLE "core"."announcement_audiences" DROP CONSTRAINT "announcement_audiences_tenant_id_announcement_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" DROP CONSTRAINT "announcement_recipients_tenant_id_announcement_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" DROP CONSTRAINT "site_post_audiences_tenant_id_post_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."site_post_recipients" DROP CONSTRAINT "site_post_recipients_tenant_id_post_id_fkey";--> statement-breakpoint
DROP TABLE "core"."announcement_audiences";--> statement-breakpoint
DROP TABLE "core"."announcement_recipients";--> statement-breakpoint
DROP TABLE "core"."announcements";--> statement-breakpoint
DROP TABLE "core"."site_posts";--> statement-breakpoint
DROP TABLE "core"."site_post_audiences";--> statement-breakpoint
DROP TABLE "core"."site_post_recipients";
