CREATE TABLE "core"."year_rollovers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"source_year_id" uuid NOT NULL,
	"source_year_type" text DEFAULT 'school_year' NOT NULL,
	"target_year_id" uuid NOT NULL,
	"target_year_type" text DEFAULT 'school_year' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"plan" jsonb NOT NULL,
	"outcome" jsonb,
	"applied_at" timestamp with time zone,
	"applied_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "year_rollovers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "year_rollovers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "year_rollovers_version_check" CHECK (version > 0),
	CONSTRAINT "year_rollovers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "year_rollovers_source_year_type_check" CHECK (source_year_type = 'school_year'),
	CONSTRAINT "year_rollovers_target_year_type_check" CHECK (target_year_type = 'school_year'),
	CONSTRAINT "year_rollovers_state_check" CHECK (state in ('draft', 'applied')),
	CONSTRAINT "year_rollovers_years_check" CHECK (source_year_id <> target_year_id),
	CONSTRAINT "year_rollovers_plan_check" CHECK (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 4194304),
	CONSTRAINT "year_rollovers_applied_check" CHECK ((state = 'applied') = (applied_at is not null and outcome is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "year_rollovers_years_key" ON "core"."year_rollovers" ("tenant_id","source_year_id","target_year_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_source_year_id_source_year_fkey_source" FOREIGN KEY ("tenant_id","source_year_id","source_year_type","source_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_target_year_id_target_year_fkey_target" FOREIGN KEY ("tenant_id","target_year_id","target_year_type","target_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_applied_by_user_id_fkey" FOREIGN KEY ("tenant_id","applied_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."year_rollovers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."year_rollovers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."year_rollovers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."year_rollovers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."year_rollovers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);