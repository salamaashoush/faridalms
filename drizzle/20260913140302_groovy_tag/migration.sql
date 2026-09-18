ALTER TABLE "school_years" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "school_years_one_current_idx" ON "school_years" ("is_current") WHERE "is_current" = true;--> statement-breakpoint
ALTER TABLE "academic_weeks" ADD CONSTRAINT "academic_weeks_dates_check" CHECK ("starts_on" <= "ends_on");--> statement-breakpoint
ALTER TABLE "academic_weeks" ADD CONSTRAINT "academic_weeks_number_check" CHECK ("number" > 0);--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_dates_check" CHECK ("starts_on" <= "ends_on");--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_revision_check" CHECK ("revision" > 0);--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_dates_check" CHECK ("starts_on" <= "ends_on");