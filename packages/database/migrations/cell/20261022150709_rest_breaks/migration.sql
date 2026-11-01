ALTER TABLE "core"."access_arrangements" ADD COLUMN "rest_breaks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD COLUMN "breaks" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD COLUMN "break_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD CONSTRAINT "quiz_sittings_breaks_check" CHECK (breaks >= 0 and break_seconds >= 0);