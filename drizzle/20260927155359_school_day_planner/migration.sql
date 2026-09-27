ALTER TABLE "core"."calendar_dates" ADD COLUMN "provisional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."calendars" ADD COLUMN "target_days" smallint;--> statement-breakpoint
ALTER TABLE "core"."calendars" ADD CONSTRAINT "calendars_target_days_check" CHECK (target_days is null or target_days between 1 and 366);