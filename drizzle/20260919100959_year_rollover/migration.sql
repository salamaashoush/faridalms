CREATE TABLE "year_rollovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_year_id" uuid NOT NULL,
	"target_year_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"plan" jsonb NOT NULL,
	"result" jsonb,
	"applied_at" timestamp with time zone,
	"applied_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "year_rollovers_pair_key" UNIQUE("source_year_id","target_year_id")
);
--> statement-breakpoint
ALTER TABLE "year_rollovers" ADD CONSTRAINT "year_rollovers_source_year_id_school_years_id_fkey" FOREIGN KEY ("source_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "year_rollovers" ADD CONSTRAINT "year_rollovers_target_year_id_school_years_id_fkey" FOREIGN KEY ("target_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "year_rollovers" ADD CONSTRAINT "year_rollovers_applied_by_id_users_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id");