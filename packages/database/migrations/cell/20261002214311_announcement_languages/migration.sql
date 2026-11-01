ALTER TABLE "core"."announcements" ADD COLUMN "title_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD COLUMN "title_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD COLUMN "translation_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD COLUMN "translation_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD COLUMN "translation_source_digest" text;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null));