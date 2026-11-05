ALTER TABLE "core"."site_pages" DROP CONSTRAINT "site_pages_kind_check";--> statement-breakpoint
ALTER TABLE "core"."site_pages" DROP CONSTRAINT "site_pages_portal_check";--> statement-breakpoint
ALTER TABLE "core"."site_pages" DROP CONSTRAINT "site_pages_door_check";--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" DROP CONSTRAINT "site_published_pages_kind_check";--> statement-breakpoint
ALTER TABLE "core"."site_pages" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" DROP COLUMN "kind";--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_slug_key" ON "core"."site_pages" ("tenant_id","org_id","slug") WHERE status = 'active';