ALTER TABLE "core"."orgs" ADD COLUMN "secondary_calendar" text;--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_secondary_calendar_check" CHECK (secondary_calendar in ('islamic-umalqura', 'islamic-civil'));--> statement-breakpoint
-- The school profile form saves the second calendar with the rest.
GRANT UPDATE (secondary_calendar) ON core.orgs TO app;
