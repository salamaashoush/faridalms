ALTER TABLE "private_files" ADD COLUMN "rejection_reason" varchar(32);--> statement-breakpoint
ALTER TABLE "private_files" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "private_files_state_idx" ON "private_files" ("state","updated_at");