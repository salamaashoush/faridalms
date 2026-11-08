ALTER TABLE "core"."files" ADD COLUMN "stream_bytes" bigint;--> statement-breakpoint
CREATE INDEX "files_stream_unmeasured_idx" ON "core"."files" ("tenant_id","id") WHERE status = 'active' and stream_state = 'ready' and stream_bytes is null;--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_stream_bytes_check" CHECK (stream_bytes >= 0);