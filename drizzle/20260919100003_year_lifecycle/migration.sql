CREATE TYPE "school_year_status" AS ENUM('planning', 'active', 'closed');--> statement-breakpoint
ALTER TYPE "permission" ADD VALUE 'years:reopen' BEFORE 'roster:read';--> statement-breakpoint
CREATE TABLE "school_year_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_year_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_years" ADD COLUMN "status" "school_year_status" DEFAULT 'active'::"school_year_status" NOT NULL;--> statement-breakpoint
CREATE INDEX "school_year_events_year_idx" ON "school_year_events" ("school_year_id","created_at");--> statement-breakpoint
ALTER TABLE "school_year_events" ADD CONSTRAINT "school_year_events_school_year_id_school_years_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_year_events" ADD CONSTRAINT "school_year_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_default_active_check" CHECK (not "is_current" or "status" = 'active');