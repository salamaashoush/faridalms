CREATE TABLE "core"."family_shares" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"attempt_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"shared_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "family_shares_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "family_shares_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "family_shares_version_check" CHECK (version > 0),
	CONSTRAINT "family_shares_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."family_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "family_shares_key" ON "core"."family_shares" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "family_shares_student_idx" ON "core"."family_shares" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_shared_by_user_id_fkey" FOREIGN KEY ("tenant_id","shared_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."family_shares" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."family_shares" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."family_shares" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."family_shares" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."family_shares" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);