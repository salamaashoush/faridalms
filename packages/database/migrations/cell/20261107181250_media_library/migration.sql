CREATE TABLE "core"."media_folders" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_folders_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_folders_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_folders_version_check" CHECK (version > 0),
	CONSTRAINT "media_folders_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "media_folders_name_check" CHECK (char_length(name) between 1 and 80),
	CONSTRAINT "media_folders_parent_id_check" CHECK (parent_id <> id)
);
--> statement-breakpoint
ALTER TABLE "core"."media_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "core"."files" ADD COLUMN "credit" jsonb;--> statement-breakpoint
CREATE INDEX "files_library_idx" ON "core"."files" ("tenant_id","host_id","folder_id") WHERE status = 'active' and host_type = 'media_library';--> statement-breakpoint
CREATE INDEX "media_folders_parent_idx" ON "core"."media_folders" ("tenant_id","org_id","parent_id") WHERE status = 'active';--> statement-breakpoint
-- The column is new and empty; checking existing rows here would read them
-- under forced row security with no tenant bound, and new and changed rows
-- are checked all the same.
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_folder_id_fkey" FOREIGN KEY ("tenant_id","folder_id") REFERENCES "core"."media_folders"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."media_folders" ADD CONSTRAINT "media_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_folders" ADD CONSTRAINT "media_folders_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_folders" ADD CONSTRAINT "media_folders_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "core"."media_folders"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_folder_id_check" CHECK (folder_id is null or host_type = 'media_library');--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_description_check" CHECK (char_length(description) <= 300);--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_credit_check" CHECK (jsonb_typeof(credit) = 'object');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_folders" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_folders" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_folders" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_folders" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_folders" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);