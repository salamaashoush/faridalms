ALTER TABLE "hosts" ADD COLUMN "role" text NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "canonical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "challenge" text NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "state_changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "hosts" ADD COLUMN "failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hosts_canonical_key" ON "hosts" ("school_id","role") WHERE canonical;--> statement-breakpoint
CREATE INDEX "hosts_school_idx" ON "hosts" ("school_id");--> statement-breakpoint
CREATE INDEX "hosts_due_idx" ON "hosts" ("checked_at") WHERE state <> 'removed';--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_role_check" CHECK (role in ('site', 'portal'));--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_state_check" CHECK (state in ('pending', 'verified', 'active', 'failing', 'removed'));--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_challenge_check" CHECK (challenge ~ '^[A-Za-z0-9_-]{32,64}$');--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_failures_check" CHECK (failures >= 0);--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_last_error_check" CHECK (char_length(last_error) between 1 and 200);--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_check" CHECK (not canonical or state <> 'removed');