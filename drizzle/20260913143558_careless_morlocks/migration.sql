ALTER TABLE "attendance" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_revision_check" CHECK ("revision" > 0);