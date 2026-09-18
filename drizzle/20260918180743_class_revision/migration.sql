ALTER TABLE "classes" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_revision_check" CHECK ("revision" > 0);