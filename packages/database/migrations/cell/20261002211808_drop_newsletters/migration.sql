ALTER TABLE "core"."newsletter_audiences" DROP CONSTRAINT "newsletter_audiences_tenant_id_newsletter_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."newsletter_recipients" DROP CONSTRAINT "newsletter_recipients_tenant_id_newsletter_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."site_posts" DROP CONSTRAINT "site_posts_tenant_id_announcement_id_fkey";--> statement-breakpoint
DROP TABLE "core"."newsletter_audiences";--> statement-breakpoint
DROP TABLE "core"."newsletter_recipients";--> statement-breakpoint
DROP TABLE "core"."newsletters";--> statement-breakpoint
ALTER TABLE "core"."site_posts" DROP COLUMN "announcement_id";--> statement-breakpoint
ALTER TABLE "core"."documents" DROP CONSTRAINT "documents_kind_check", ADD CONSTRAINT "documents_kind_check" CHECK (kind in ('rich_text', 'page', 'lesson', 'transcript'));