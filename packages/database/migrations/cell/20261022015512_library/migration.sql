ALTER TABLE "core"."document_templates" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "subject_descriptor_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "subject_ns" text GENERATED ALWAYS AS ('subject') STORED;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "state" text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_subject_descriptor_id_subject_fkey" FOREIGN KEY ("tenant_id","subject_descriptor_id","subject_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_description_check" CHECK (char_length(description) <= 500);--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_state_check" CHECK (state in ('pending', 'shared', 'declined'));--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_review_note_check" CHECK (review_note is null or char_length(review_note) between 1 and 500);