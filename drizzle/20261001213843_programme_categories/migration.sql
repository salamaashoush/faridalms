CREATE TABLE "core"."programme_categories" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"programme_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"weight" numeric(5,2) NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "programme_categories_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "programme_categories_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "programme_categories_version_check" CHECK (version > 0),
	CONSTRAINT "programme_categories_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "programme_categories_weight_check" CHECK (weight > 0 and weight <= 100),
	CONSTRAINT "programme_categories_title_en_check" CHECK (char_length(title_en) between 1 and 60),
	CONSTRAINT "programme_categories_title_ar_check" CHECK (char_length(title_ar) between 1 and 60),
	CONSTRAINT "programme_categories_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."programme_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "category_id" uuid;--> statement-breakpoint
CREATE INDEX "programme_categories_programme_idx" ON "core"."programme_categories" ("tenant_id","programme_id") WHERE status = 'active';--> statement-breakpoint
-- The column is new and empty on a table that already holds rows; checking
-- it here would read them under forced row security with no tenant bound.
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."programme_categories"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."programme_categories" ADD CONSTRAINT "programme_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."programme_categories" ADD CONSTRAINT "programme_categories_tenant_id_programme_id_fkey" FOREIGN KEY ("tenant_id","programme_id") REFERENCES "core"."programmes"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."programme_categories" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."programme_categories" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."programme_categories" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."programme_categories" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."programme_categories" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);