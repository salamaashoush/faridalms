CREATE TABLE "core"."lti_keys" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"kid" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"sealed_private_jwk" text NOT NULL,
	"retired_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lti_keys_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lti_keys_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lti_keys_version_check" CHECK (version > 0),
	CONSTRAINT "lti_keys_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lti_keys_kid_check" CHECK (char_length(kid) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "core"."lti_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lti_replays" (
	"tenant_id" uuid,
	"key_hash" bytea,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lti_replays_pkey" PRIMARY KEY("tenant_id","key_hash"),
	CONSTRAINT "lti_replays_key_hash_check" CHECK (octet_length(key_hash) = 32)
);
--> statement-breakpoint
ALTER TABLE "core"."lti_replays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lti_tools" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"deployment_id" text NOT NULL,
	"login_url" text NOT NULL,
	"launch_url" text NOT NULL,
	"redirect_urls" jsonb NOT NULL,
	"jwks_url" text NOT NULL,
	"deep_link_url" text,
	"send_names" boolean DEFAULT false NOT NULL,
	"custom" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lti_tools_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lti_tools_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lti_tools_version_check" CHECK (version > 0),
	CONSTRAINT "lti_tools_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lti_tools_name_check" CHECK (char_length(name) between 1 and 120),
	CONSTRAINT "lti_tools_urls_check" CHECK (login_url like 'https://%' and launch_url like 'https://%' and jwks_url like 'https://%' and (deep_link_url is null or deep_link_url like 'https://%') and char_length(login_url) <= 500 and char_length(launch_url) <= 500 and char_length(jwks_url) <= 500 and char_length(coalesce(deep_link_url, '')) <= 500),
	CONSTRAINT "lti_tools_redirect_urls_check" CHECK (jsonb_typeof(redirect_urls) = 'array' and jsonb_array_length(redirect_urls) between 1 and 5),
	CONSTRAINT "lti_tools_custom_check" CHECK (jsonb_typeof(custom) = 'object' and octet_length(custom::text) <= 16384),
	CONSTRAINT "lti_tools_ids_check" CHECK (char_length(client_id) between 1 and 255 and char_length(deployment_id) between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "lti_keys_kid_key" ON "core"."lti_keys" ("tenant_id","kid");--> statement-breakpoint
CREATE UNIQUE INDEX "lti_keys_active_key" ON "core"."lti_keys" ("tenant_id","org_id") WHERE status = 'active' and retired_at is null;--> statement-breakpoint
CREATE INDEX "lti_replays_expiry_idx" ON "core"."lti_replays" ("tenant_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lti_tools_client_key" ON "core"."lti_tools" ("tenant_id","client_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lti_tools_org_idx" ON "core"."lti_tools" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."lti_keys" ADD CONSTRAINT "lti_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lti_keys" ADD CONSTRAINT "lti_keys_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lti_replays" ADD CONSTRAINT "lti_replays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD CONSTRAINT "lti_tools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD CONSTRAINT "lti_tools_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lti_keys" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lti_keys" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lti_keys" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lti_keys" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lti_keys" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lti_replays" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lti_replays" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lti_replays" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lti_replays" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lti_replays" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."lti_replays" AS PERMISSIVE FOR DELETE TO "retention" USING (expires_at < statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lti_tools" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lti_tools" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lti_tools" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lti_tools" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lti_tools" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);