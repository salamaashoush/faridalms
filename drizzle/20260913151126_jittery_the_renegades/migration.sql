CREATE TABLE "message_drafts" (
	"id" uuid PRIMARY KEY,
	"author_id" uuid NOT NULL,
	"category" "message_category" NOT NULL,
	"recipient_id" uuid,
	"student_id" uuid,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"body_format" "message_body_format" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"sent_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_drafts_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "message_drafts_author_updated_idx" ON "message_drafts" ("author_id","updated_at","id") WHERE "sent_message_id" is null;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_recipient_id_users_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_sent_message_id_messages_id_fkey" FOREIGN KEY ("sent_message_id") REFERENCES "messages"("id");