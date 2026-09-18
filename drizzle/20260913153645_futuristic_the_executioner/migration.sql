CREATE TABLE "newsletter_drafts" (
	"id" uuid PRIMARY KEY,
	"school_year_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"document" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_drafts_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "newsletter_drafts_year_updated_idx" ON "newsletter_drafts" ("school_year_id","updated_at","id");--> statement-breakpoint
ALTER TABLE "newsletter_drafts" ADD CONSTRAINT "newsletter_drafts_school_year_id_school_years_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id");--> statement-breakpoint
ALTER TABLE "newsletter_drafts" ADD CONSTRAINT "newsletter_drafts_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "newsletter_drafts" ADD CONSTRAINT "newsletter_drafts_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;