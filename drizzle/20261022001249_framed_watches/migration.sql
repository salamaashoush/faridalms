ALTER TABLE "core"."lesson_watches" ADD COLUMN "embed" text;--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD COLUMN "video" text GENERATED ALWAYS AS (coalesce(file_id::text, embed)) STORED;--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "core"."lesson_watches_key";--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_watches_key" ON "core"."lesson_watches" ("tenant_id","lesson_id","student_user_id","video") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_video_check" CHECK ((file_id is null) <> (embed is null) and (embed is null or embed ~ '^(youtube:[A-Za-z0-9_-]{11}|vimeo:[0-9]{4,12})$'));