CREATE TABLE "core"."admission_events" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" text NOT NULL,
	"starts_on" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"attendee_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"outcome" text DEFAULT 'scheduled' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_events_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_events_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_events_version_check" CHECK (version > 0),
	CONSTRAINT "admission_events_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_events_kind_check" CHECK (kind in ('tour', 'assessment', 'interview')),
	CONSTRAINT "admission_events_outcome_check" CHECK (outcome in ('scheduled', 'attended', 'missed', 'cancelled')),
	CONSTRAINT "admission_events_times_check" CHECK (start_time < end_time),
	CONSTRAINT "admission_events_location_check" CHECK (char_length(location) <= 200),
	CONSTRAINT "admission_events_result_check" CHECK (char_length(result) <= 2000),
	CONSTRAINT "admission_events_attendees_check" CHECK (cardinality(attendee_user_ids) <= 10)
);
--> statement-breakpoint
ALTER TABLE "core"."admission_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_letters" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"template_id" uuid,
	"sent_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_letters_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_letters_kind_check" CHECK (kind in ('offer', 'waitlist', 'decline', 'welcome')),
	CONSTRAINT "admission_letters_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "admission_letters_title_check" CHECK (char_length(title) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "offer_expires_on" date;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "student_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD COLUMN "deferred_from_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "builtin_key" text;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "admission_events_application_idx" ON "core"."admission_events" ("tenant_id","application_id","starts_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_events_day_idx" ON "core"."admission_events" ("tenant_id","org_id","starts_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_letters_application_idx" ON "core"."admission_letters" ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_builtin_key" ON "core"."document_templates" ("tenant_id","org_id","builtin_key") WHERE builtin_key is not null;--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id","item_id") REFERENCES "core"."admission_items"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_sent_by_user_id_fkey" FOREIGN KEY ("tenant_id","sent_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_decision_check" CHECK (decision in ('offer', 'waitlist', 'decline'));--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_decided_check" CHECK ((state <> 'decided' or (decision is not null and released_at is null))
        and (decision is null) = (decided_at is null));--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_offered_check" CHECK (state <> 'offered' or offer_expires_on is not null);--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_enrolled_check" CHECK ((state = 'enrolled') = (student_user_id is not null));--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_builtin_check" CHECK ((builtin_key is null) = (owner_user_id is not null));--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_builtin_key_check" CHECK (builtin_key ~ '^[a-z][a-z0-9_]{1,62}$');--> statement-breakpoint
ALTER TABLE "core"."student_school_years" DROP CONSTRAINT "student_school_years_source_check", ADD CONSTRAINT "student_school_years_source_check" CHECK (source in ('manual', 'import', 'sis', 'oneroster', 'rollover', 'admission'));--> statement-breakpoint
ALTER TABLE "core"."document_templates" DROP CONSTRAINT "document_templates_kind_check", ADD CONSTRAINT "document_templates_kind_check" CHECK (kind in ('lesson', 'assignment', 'unit_plan', 'news', 'announcement', 'event', 'consent_form', 'module', 'admission_letter'));--> statement-breakpoint
ALTER TABLE "core"."admission_entries" DROP CONSTRAINT "admission_entries_kind_check", ADD CONSTRAINT "admission_entries_kind_check" CHECK (kind in ('note', 'state', 'item', 'event'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_events" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_events" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_events" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_events" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_events" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."admission_events" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.admission_applications a
        where a.tenant_id = admission_events.tenant_id and a.id = admission_events.application_id
          and app.erasure_approved(a.tenant_id, a.applicant_user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_letters" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_letters" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_letters" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_letters" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);