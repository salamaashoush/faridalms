CREATE TABLE "core"."assistant_requests" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task" text NOT NULL,
	"host_type" text NOT NULL,
	"host_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"day" date NOT NULL,
	"sent_characters" integer NOT NULL,
	"received_characters" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"outcome" text DEFAULT 'running' NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assistant_requests_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assistant_requests_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assistant_requests_version_check" CHECK (version > 0),
	CONSTRAINT "assistant_requests_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assistant_requests_task_check" CHECK (task in ('questions', 'level', 'translate')),
	CONSTRAINT "assistant_requests_host_type_check" CHECK (host_type in ('lesson', 'assignment')),
	CONSTRAINT "assistant_requests_provider_check" CHECK (provider in ('anthropic')),
	CONSTRAINT "assistant_requests_model_check" CHECK (char_length(model) between 1 and 100),
	CONSTRAINT "assistant_requests_counts_check" CHECK (sent_characters >= 0 and received_characters >= 0
        and coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0),
	CONSTRAINT "assistant_requests_outcome_check" CHECK (outcome in ('running', 'done', 'failed', 'cancelled')
        and (outcome = 'running') = (finished_at is null))
);
--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assistant_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" text NOT NULL,
	"daily_limit" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assistant_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assistant_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assistant_settings_version_check" CHECK (version > 0),
	CONSTRAINT "assistant_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assistant_settings_provider_check" CHECK (provider in ('anthropic')),
	CONSTRAINT "assistant_settings_daily_limit_check" CHECK (daily_limit between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "core"."assistant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "assistant_requests_day_idx" ON "core"."assistant_requests" ("tenant_id","org_id","day");--> statement-breakpoint
CREATE INDEX "assistant_requests_host_idx" ON "core"."assistant_requests" ("tenant_id","host_type","host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_settings_org_key" ON "core"."assistant_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ADD CONSTRAINT "assistant_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ADD CONSTRAINT "assistant_requests_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ADD CONSTRAINT "assistant_requests_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assistant_settings" ADD CONSTRAINT "assistant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assistant_settings" ADD CONSTRAINT "assistant_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assistant_requests" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assistant_requests" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assistant_requests" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assistant_requests" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assistant_requests" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assistant_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assistant_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assistant_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assistant_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assistant_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);