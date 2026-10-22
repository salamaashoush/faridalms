CREATE TABLE "core"."standard_frameworks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"case_identifier" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_frameworks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_frameworks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_frameworks_version_check" CHECK (version > 0),
	CONSTRAINT "standard_frameworks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_frameworks_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "standard_frameworks_description_check" CHECK (char_length(description) <= 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."standard_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."standards" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"framework_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text DEFAULT '' NOT NULL,
	"statement" text NOT NULL,
	"item_type" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"case_identifier" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standards_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standards_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standards_version_check" CHECK (version > 0),
	CONSTRAINT "standards_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standards_code_check" CHECK (char_length(code) <= 60),
	CONSTRAINT "standards_statement_check" CHECK (char_length(statement) between 1 and 2000),
	CONSTRAINT "standards_item_type_check" CHECK (char_length(item_type) <= 60),
	CONSTRAINT "standards_position_check" CHECK (position >= 0),
	CONSTRAINT "standards_parent_check" CHECK (parent_id is distinct from id)
);
--> statement-breakpoint
ALTER TABLE "core"."standards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "standard_frameworks_case_key" ON "core"."standard_frameworks" ("tenant_id","org_id","case_identifier") WHERE status = 'active' and case_identifier is not null;--> statement-breakpoint
CREATE INDEX "standard_frameworks_org_idx" ON "core"."standard_frameworks" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "standards_case_key" ON "core"."standards" ("tenant_id","framework_id","case_identifier") WHERE status = 'active' and case_identifier is not null;--> statement-breakpoint
CREATE INDEX "standards_framework_idx" ON "core"."standards" ("tenant_id","framework_id","parent_id","position") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."standard_frameworks" ADD CONSTRAINT "standard_frameworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_frameworks" ADD CONSTRAINT "standard_frameworks_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standards" ADD CONSTRAINT "standards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standards" ADD CONSTRAINT "standards_tenant_id_framework_id_fkey" FOREIGN KEY ("tenant_id","framework_id") REFERENCES "core"."standard_frameworks"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standards" ADD CONSTRAINT "standards_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_frameworks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_frameworks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_frameworks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_frameworks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_frameworks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standards" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standards" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standards" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standards" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standards" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);