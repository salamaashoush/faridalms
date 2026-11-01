ALTER TABLE "core"."site_pages" ADD COLUMN "kind" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD COLUMN "kind" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
DROP INDEX "core"."site_pages_slug_key";--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_slug_key" ON "core"."site_pages" ("tenant_id","org_id","kind","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_portal_key" ON "core"."site_pages" ("tenant_id","org_id") WHERE status = 'active' and kind = 'portal';--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_kind_check" CHECK (kind in ('site', 'portal'));--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_portal_check" CHECK (kind = 'site' or (not is_home and not in_menu and parent_id is null));--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_kind_check" CHECK (kind in ('site', 'portal'));