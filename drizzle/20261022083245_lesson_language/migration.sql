ALTER TABLE "core"."lessons" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_language_check" CHECK (language in ('en', 'ar'));