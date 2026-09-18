ALTER TYPE "file_purpose" ADD VALUE 'message_attachment';--> statement-breakpoint
ALTER TYPE "message_body_format" ADD VALUE 'rich';--> statement-breakpoint
CREATE TABLE "message_draft_files" (
	"draft_id" uuid,
	"file_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "message_draft_files_pkey" PRIMARY KEY("draft_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "message_attachments" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "message_attachments_file_idx" ON "message_attachments" ("file_id");--> statement-breakpoint
CREATE INDEX "message_draft_files_file_idx" ON "message_draft_files" ("file_id");--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_private_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "private_files"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "message_draft_files" ADD CONSTRAINT "message_draft_files_draft_id_message_drafts_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "message_drafts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_draft_files" ADD CONSTRAINT "message_draft_files_file_id_private_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "private_files"("id") ON DELETE RESTRICT;