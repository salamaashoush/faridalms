ALTER TABLE "core"."calendar_events" ADD COLUMN "translation_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD COLUMN "translation_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD COLUMN "translation_source_digest" text;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null));