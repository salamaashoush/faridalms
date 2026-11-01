ALTER TABLE "core"."lesson_watches" RENAME COLUMN "updated_at" TO "date_last_modified";--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD COLUMN "metadata" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD COLUMN "created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL;--> statement-breakpoint
DROP INDEX "core"."lesson_watches_key";--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_watches_key" ON "core"."lesson_watches" ("tenant_id","lesson_id","student_user_id","file_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_status_check" CHECK (status in ('active', 'tobedeleted'));--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_version_check" CHECK (version > 0);--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384);--> statement-breakpoint
-- A watch is updated in place, so it carries the version and dates every
-- updatable row keeps, maintained as on every other entity table.
create trigger row_meta before insert or update on core.lesson_watches for each row execute function app.row_meta();
