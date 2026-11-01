ALTER TABLE "core"."orgs" DROP CONSTRAINT "orgs_website_url_check";--> statement-breakpoint
ALTER TABLE "core"."site_settings" DROP CONSTRAINT "site_settings_primary_locale_check";--> statement-breakpoint
ALTER TABLE "core"."orgs" DROP COLUMN "website_url";--> statement-breakpoint
ALTER TABLE "core"."site_settings" DROP COLUMN "primary_locale";--> statement-breakpoint
ALTER TABLE "core"."orgs" ALTER COLUMN "default_locale" SET NOT NULL;