CREATE TABLE "core"."xapi_statements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"statement" jsonb,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"leased_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "xapi_statements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "xapi_statements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "xapi_statements_version_check" CHECK (version > 0),
	CONSTRAINT "xapi_statements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "xapi_statements_state_check" CHECK (state in ('queued', 'sending', 'sent', 'failed')),
	CONSTRAINT "xapi_statements_attempts_check" CHECK (attempts between 0 and 20),
	CONSTRAINT "xapi_statements_error_check" CHECK (char_length(error) <= 500),
	CONSTRAINT "xapi_statements_statement_check" CHECK ((state = 'sent' or statement is not null)
        and (statement is null or (jsonb_typeof(statement) = 'object' and octet_length(statement::text) <= 65536))),
	CONSTRAINT "xapi_statements_lease_check" CHECK ((state = 'sending') = (leased_until is not null)),
	CONSTRAINT "xapi_statements_sent_check" CHECK ((state = 'sent') = (sent_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."xapi_statements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."xapi_stores" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"username" text NOT NULL,
	"sealed_secret" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "xapi_stores_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "xapi_stores_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "xapi_stores_version_check" CHECK (version > 0),
	CONSTRAINT "xapi_stores_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "xapi_stores_endpoint_check" CHECK (endpoint like 'https://%/' and char_length(endpoint) <= 500),
	CONSTRAINT "xapi_stores_username_check" CHECK (char_length(username) between 1 and 200),
	CONSTRAINT "xapi_stores_sealed_secret_check" CHECK (char_length(coalesce(sealed_secret, '')) <= 2000),
	CONSTRAINT "xapi_stores_enabled_check" CHECK (not enabled or sealed_secret is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."xapi_stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "xapi_statements_key" ON "core"."xapi_statements" ("tenant_id","org_id","statement_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "xapi_statements_queue_idx" ON "core"."xapi_statements" ("tenant_id","due_at") WHERE status = 'active' and state in ('queued', 'sending');--> statement-breakpoint
CREATE INDEX "xapi_statements_student_idx" ON "core"."xapi_statements" ("tenant_id","student_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xapi_stores_org_key" ON "core"."xapi_stores" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."xapi_statements" ADD CONSTRAINT "xapi_statements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."xapi_statements" ADD CONSTRAINT "xapi_statements_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."xapi_statements" ADD CONSTRAINT "xapi_statements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."xapi_stores" ADD CONSTRAINT "xapi_stores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."xapi_stores" ADD CONSTRAINT "xapi_stores_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."xapi_statements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."xapi_statements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."xapi_statements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."xapi_statements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."xapi_statements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."xapi_statements" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."xapi_statements" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."xapi_stores" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."xapi_stores" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."xapi_stores" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."xapi_stores" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."xapi_stores" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);