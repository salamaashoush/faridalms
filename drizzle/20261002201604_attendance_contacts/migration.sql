CREATE TABLE "core"."attendance_contacts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attendance_contacts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attendance_contacts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attendance_contacts_version_check" CHECK (version > 0),
	CONSTRAINT "attendance_contacts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attendance_contacts_outcome_check" CHECK (outcome in ('reached', 'no_answer', 'left_message', 'messaged')),
	CONSTRAINT "attendance_contacts_note_check" CHECK (char_length(note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."attendance_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "attendance_contacts_day_idx" ON "core"."attendance_contacts" ("tenant_id","org_id","day_on") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."attendance_contacts" ADD CONSTRAINT "attendance_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_contacts" ADD CONSTRAINT "attendance_contacts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attendance_contacts" ADD CONSTRAINT "attendance_contacts_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attendance_contacts" ADD CONSTRAINT "attendance_contacts_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attendance_contacts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attendance_contacts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attendance_contacts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attendance_contacts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attendance_contacts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);