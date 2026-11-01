CREATE TABLE "core"."caption_drafts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"language" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"leased_until" timestamp with time zone,
	"progress" real,
	"error" text,
	"vtt" text,
	"requested_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "caption_drafts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "caption_drafts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "caption_drafts_version_check" CHECK (version > 0),
	CONSTRAINT "caption_drafts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "caption_drafts_language_check" CHECK (language in ('ar', 'en')),
	CONSTRAINT "caption_drafts_state_check" CHECK (state in ('queued', 'working', 'ready', 'failed')),
	CONSTRAINT "caption_drafts_attempts_check" CHECK (attempts between 0 and 10),
	CONSTRAINT "caption_drafts_progress_check" CHECK (progress between 0 and 1),
	CONSTRAINT "caption_drafts_error_check" CHECK (char_length(error) <= 2000),
	CONSTRAINT "caption_drafts_vtt_check" CHECK (char_length(vtt) <= 524288),
	CONSTRAINT "caption_drafts_lease_check" CHECK ((state = 'working') = (leased_until is not null)),
	CONSTRAINT "caption_drafts_ready_check" CHECK ((state = 'ready') = (vtt is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "caption_drafts_key" ON "core"."caption_drafts" ("tenant_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "caption_drafts_queue_idx" ON "core"."caption_drafts" ("tenant_id","created_at") WHERE status = 'active' and state in ('queued', 'working');--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ADD CONSTRAINT "caption_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ADD CONSTRAINT "caption_drafts_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ADD CONSTRAINT "caption_drafts_tenant_id_requested_by_user_id_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."caption_drafts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."caption_drafts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."caption_drafts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."caption_drafts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."caption_drafts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);