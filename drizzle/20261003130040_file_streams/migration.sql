ALTER TABLE "core"."files" ADD COLUMN "stream_state" text;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "stream_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "stream_leased_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "stream_progress" real;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "stream_error" text;--> statement-breakpoint
CREATE INDEX "files_stream_queue_idx" ON "core"."files" ("tenant_id","ready_at") WHERE status = 'active' and stream_state in ('queued', 'encoding');--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_stream_state_check" CHECK (stream_state in ('queued', 'encoding', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_stream_attempts_check" CHECK (stream_attempts between 0 and 10);--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_stream_progress_check" CHECK (stream_progress between 0 and 1);--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_stream_error_check" CHECK (char_length(stream_error) <= 2000);--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_stream_lease_check" CHECK ((stream_state = 'encoding') = (stream_leased_until is not null));