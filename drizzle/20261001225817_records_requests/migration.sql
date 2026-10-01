CREATE TABLE "core"."records_requests" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"relation" text NOT NULL,
	"kind" text NOT NULL,
	"law" text NOT NULL,
	"received_on" date NOT NULL,
	"clock_from" date NOT NULL,
	"due_on" date NOT NULL,
	"extended_to" date,
	"extension_reason" text,
	"details" text,
	"outcome" text,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"outcome_note" text,
	"logged_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "records_requests_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "records_requests_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "records_requests_version_check" CHECK (version > 0),
	CONSTRAINT "records_requests_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "records_requests_requested_by_check" CHECK (char_length(requested_by) between 1 and 120),
	CONSTRAINT "records_requests_relation_check" CHECK (relation in ('self', 'parent', 'representative', 'authority')),
	CONSTRAINT "records_requests_kind_check" CHECK (kind in ('access', 'correction', 'erasure', 'objection')),
	CONSTRAINT "records_requests_law_check" CHECK (law in ('uk_gdpr', 'england_record', 'ferpa', 'egypt', 'other')),
	CONSTRAINT "records_requests_dates_check" CHECK (clock_from >= received_on and due_on >= clock_from and (extended_to is null or extended_to > due_on)),
	CONSTRAINT "records_requests_extension_check" CHECK ((extended_to is null) = (extension_reason is null) and (extended_to is null or law = 'uk_gdpr')),
	CONSTRAINT "records_requests_extension_reason_check" CHECK (char_length(extension_reason) between 1 and 500),
	CONSTRAINT "records_requests_details_check" CHECK (char_length(details) <= 2000),
	CONSTRAINT "records_requests_outcome_check" CHECK (outcome in ('completed', 'refused', 'withdrawn')),
	CONSTRAINT "records_requests_closed_check" CHECK ((outcome is null) = (closed_at is null) and (outcome is null) = (closed_by_user_id is null) and (outcome is null) = (outcome_note is null)),
	CONSTRAINT "records_requests_outcome_note_check" CHECK (char_length(outcome_note) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "core"."records_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "records_requests_open_idx" ON "core"."records_requests" ("tenant_id","org_id","due_on") WHERE status = 'active' and outcome is null;--> statement-breakpoint
CREATE INDEX "records_requests_subject_idx" ON "core"."records_requests" ("tenant_id","subject_user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_closed_by_user_id_fkey" FOREIGN KEY ("tenant_id","closed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_logged_by_user_id_fkey" FOREIGN KEY ("tenant_id","logged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."records_requests" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."records_requests" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."records_requests" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."records_requests" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."records_requests" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);