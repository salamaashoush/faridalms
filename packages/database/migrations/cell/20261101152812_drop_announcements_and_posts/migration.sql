DROP POLICY "tenant_isolation" ON "core"."announcement_audiences";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."announcement_audiences";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."announcement_audiences";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."announcement_audiences";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."announcement_audiences";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."announcement_recipients";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."announcement_recipients";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."announcement_recipients";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."announcement_recipients";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."announcement_recipients";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."announcements";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."announcements";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."announcements";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."announcements";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."announcements";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."site_posts";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."site_posts";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."site_posts";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."site_posts";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."site_posts";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."site_post_audiences";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."site_post_audiences";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."site_post_audiences";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."site_post_audiences";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."site_post_audiences";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."site_post_recipients";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."site_post_recipients";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."site_post_recipients";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."site_post_recipients";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."site_post_recipients";--> statement-breakpoint
ALTER TABLE "core"."announcement_audiences" DROP CONSTRAINT "announcement_audiences_tenant_id_announcement_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" DROP CONSTRAINT "announcement_recipients_tenant_id_announcement_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."site_post_audiences" DROP CONSTRAINT "site_post_audiences_tenant_id_post_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."site_post_recipients" DROP CONSTRAINT "site_post_recipients_tenant_id_post_id_fkey";--> statement-breakpoint
DROP TABLE "core"."announcement_audiences";--> statement-breakpoint
DROP TABLE "core"."announcement_recipients";--> statement-breakpoint
DROP TABLE "core"."announcements";--> statement-breakpoint
DROP TABLE "core"."site_posts";--> statement-breakpoint
DROP TABLE "core"."site_post_audiences";--> statement-breakpoint
DROP TABLE "core"."site_post_recipients";--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" DROP CONSTRAINT "site_published_posts_tenant_id_post_id_fkey", ADD CONSTRAINT "site_published_posts_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."broadcasts"("tenant_id","id");