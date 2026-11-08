CREATE TABLE "core"."media_item_tags" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tagged_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_item_tags_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_item_tags_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_item_tags_version_check" CHECK (version > 0),
	CONSTRAINT "media_item_tags_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."media_item_texts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"title" text,
	"caption" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_item_texts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_item_texts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_item_texts_version_check" CHECK (version > 0),
	CONSTRAINT "media_item_texts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "media_item_texts_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "media_item_texts_caption_check" CHECK (char_length(caption) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."media_item_texts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."media_tags" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_tags_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_tags_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_tags_version_check" CHECK (version > 0),
	CONSTRAINT "media_tags_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "media_tags_name_check" CHECK (char_length(name) between 1 and 40 and name = btrim(name))
);
--> statement-breakpoint
ALTER TABLE "core"."media_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "core"."files" ("tenant_id","sha256") WHERE status = 'active' and state = 'ready' and encryption = 'bucket';--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_tags_key" ON "core"."media_item_tags" ("tenant_id","file_id","tag_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "media_item_tags_tag_idx" ON "core"."media_item_tags" ("tenant_id","tag_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_texts_file_key" ON "core"."media_item_texts" ("tenant_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "media_tags_name_key" ON "core"."media_tags" ("tenant_id","org_id",lower("name")) WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_tag_id_fkey" FOREIGN KEY ("tenant_id","tag_id") REFERENCES "core"."media_tags"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_tagged_by_user_id_fkey" FOREIGN KEY ("tenant_id","tagged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_texts" ADD CONSTRAINT "media_item_texts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_item_texts" ADD CONSTRAINT "media_item_texts_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_tags" ADD CONSTRAINT "media_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_tags" ADD CONSTRAINT "media_tags_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_item_tags" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_item_tags" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_item_tags" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_item_tags" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_item_tags" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_item_texts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_item_texts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_item_texts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_item_texts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_item_texts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_tags" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_tags" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_tags" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_tags" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_tags" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);