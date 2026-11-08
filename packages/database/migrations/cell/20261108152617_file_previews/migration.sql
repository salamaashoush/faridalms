CREATE TABLE "core"."file_previews" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"storage_key" text NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"leased_until" timestamp with time zone,
	"progress" real,
	"error" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"placeholder" text,
	"sizes" jsonb DEFAULT '[]' NOT NULL,
	"waveform" jsonb,
	"pages" integer,
	"document_bytes" bigint,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "file_previews_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "file_previews_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "file_previews_version_check" CHECK (version > 0),
	CONSTRAINT "file_previews_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "file_previews_storage_key_check" CHECK (starts_with(storage_key, 't/' || tenant_id::text || '/f/') and char_length(storage_key) <= 512),
	CONSTRAINT "file_previews_kind_check" CHECK (kind in ('picture', 'audio', 'pdf', 'office')),
	CONSTRAINT "file_previews_media_type_check" CHECK (char_length(media_type) between 3 and 128),
	CONSTRAINT "file_previews_state_check" CHECK (state in ('queued', 'working', 'ready', 'failed')),
	CONSTRAINT "file_previews_attempts_check" CHECK (attempts between 0 and 10),
	CONSTRAINT "file_previews_progress_check" CHECK (progress between 0 and 1),
	CONSTRAINT "file_previews_error_check" CHECK (char_length(error) <= 2000),
	CONSTRAINT "file_previews_lease_check" CHECK ((state = 'working') = (leased_until is not null)),
	CONSTRAINT "file_previews_width_check" CHECK (width between 1 and 100000),
	CONSTRAINT "file_previews_height_check" CHECK (height between 1 and 100000),
	CONSTRAINT "file_previews_duration_ms_check" CHECK (duration_ms > 0),
	CONSTRAINT "file_previews_placeholder_check" CHECK (placeholder ~ '^[A-Za-z0-9+/]{4,80}={0,2}$'),
	CONSTRAINT "file_previews_sizes_check" CHECK (jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) <= 20),
	CONSTRAINT "file_previews_waveform_check" CHECK (jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) <= 400),
	CONSTRAINT "file_previews_pages_check" CHECK (pages > 0),
	CONSTRAINT "file_previews_document_bytes_check" CHECK (document_bytes > 0),
	CONSTRAINT "file_previews_bytes_check" CHECK (bytes >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."file_previews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "file_previews_key" ON "core"."file_previews" ("tenant_id","storage_key") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "file_previews_queue_idx" ON "core"."file_previews" ("tenant_id","created_at") WHERE status = 'active' and state in ('queued', 'working');--> statement-breakpoint
ALTER TABLE "core"."file_previews" ADD CONSTRAINT "file_previews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."file_previews" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."file_previews" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."file_previews" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."file_previews" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."file_previews" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);