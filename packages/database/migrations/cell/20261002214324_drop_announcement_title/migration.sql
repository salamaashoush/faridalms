ALTER TABLE "core"."announcements" DROP CONSTRAINT "announcements_title_check";--> statement-breakpoint
ALTER TABLE "core"."announcements" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_title_check" CHECK (char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> ''));
