ALTER TABLE "core"."site_settings" ADD COLUMN "theme" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD COLUMN "chrome" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD CONSTRAINT "site_settings_theme_check" CHECK (jsonb_typeof(theme) = 'object' and octet_length(theme::text) <= 8192);--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD CONSTRAINT "site_settings_chrome_check" CHECK (jsonb_typeof(chrome) = 'object' and octet_length(chrome::text) <= 65536);