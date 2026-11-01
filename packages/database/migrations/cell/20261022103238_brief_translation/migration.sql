ALTER TABLE "core"."assignments" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "translation_title" text;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "translation_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "translation_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "translation_source_digest" text;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_language_check" CHECK (language in ('en', 'ar'));--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_translation_title_check" CHECK (translation_title is null or (language is not null and char_length(translation_title) between 1 and 200));--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null));