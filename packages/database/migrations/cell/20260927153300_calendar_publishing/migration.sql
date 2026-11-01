ALTER TABLE "core"."calendar_events" ADD COLUMN "state" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD COLUMN "update_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_state_check" CHECK (state in ('draft', 'published'));