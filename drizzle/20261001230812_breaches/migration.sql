CREATE TABLE "core"."breaches" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"law" text NOT NULL,
	"risk" text NOT NULL,
	"people_affected" integer,
	"regulator_notified_at" timestamp with time zone,
	"regulator_reference" text,
	"regulator_reason" text,
	"people_notified_at" timestamp with time zone,
	"people_reason" text,
	"actions" text,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"logged_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "breaches_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "breaches_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "breaches_version_check" CHECK (version > 0),
	CONSTRAINT "breaches_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "breaches_title_check" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "breaches_description_check" CHECK (char_length(description) between 1 and 4000),
	CONSTRAINT "breaches_law_check" CHECK (law in ('uk_gdpr', 'egypt', 'other')),
	CONSTRAINT "breaches_risk_check" CHECK (risk in ('unlikely', 'risk', 'high')),
	CONSTRAINT "breaches_people_affected_check" CHECK (people_affected between 0 and 10000000),
	CONSTRAINT "breaches_regulator_check" CHECK (num_nonnulls(regulator_notified_at, regulator_reason) <= 1 and (regulator_reference is null or regulator_notified_at is not null)),
	CONSTRAINT "breaches_people_check" CHECK (num_nonnulls(people_notified_at, people_reason) <= 1),
	CONSTRAINT "breaches_notes_check" CHECK (char_length(regulator_reference) between 1 and 120 and char_length(regulator_reason) between 1 and 1000 and char_length(people_reason) between 1 and 1000 and char_length(actions) between 1 and 4000),
	CONSTRAINT "breaches_closed_check" CHECK ((closed_at is null) = (closed_by_user_id is null) and (closed_at is null or (actions is not null and num_nonnulls(regulator_notified_at, regulator_reason) = 1 and num_nonnulls(people_notified_at, people_reason) = 1)))
);
--> statement-breakpoint
ALTER TABLE "core"."breaches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "breaches_org_idx" ON "core"."breaches" ("tenant_id","org_id","discovered_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_closed_by_user_id_fkey" FOREIGN KEY ("tenant_id","closed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_logged_by_user_id_fkey" FOREIGN KEY ("tenant_id","logged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."breaches" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."breaches" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."breaches" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."breaches" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."breaches" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);