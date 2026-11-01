CREATE TABLE "core"."site_enquiry_entries" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_enquiry_entries_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_enquiry_entries_kind_check" CHECK (kind in ('note', 'call', 'email', 'meeting', 'reply', 'state', 'assigned')),
	CONSTRAINT "site_enquiry_entries_body_check" CHECK (char_length(body) <= 5200),
	CONSTRAINT "site_enquiry_entries_details_check" CHECK (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
);
--> statement-breakpoint
ALTER TABLE "core"."site_enquiry_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "source" text DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "child_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "answers" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "state" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "state_changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "assignee_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "first_responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "family_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "applicant_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ALTER COLUMN "email" SET DEFAULT '';--> statement-breakpoint
CREATE INDEX "site_enquiries_state_idx" ON "core"."site_enquiries" ("tenant_id","org_id","state","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_enquiries_assignee_idx" ON "core"."site_enquiries" ("tenant_id","assignee_user_id","state") WHERE status = 'active' and assignee_user_id is not null;--> statement-breakpoint
CREATE INDEX "site_enquiries_email_idx" ON "core"."site_enquiries" ("tenant_id","org_id",lower(email)) WHERE status = 'active' and email <> '';--> statement-breakpoint
CREATE INDEX "site_enquiry_entries_enquiry_idx" ON "core"."site_enquiry_entries" ("tenant_id","enquiry_id","created_at");--> statement-breakpoint
ALTER TABLE "core"."site_enquiry_entries" ADD CONSTRAINT "site_enquiry_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiry_entries" ADD CONSTRAINT "site_enquiry_entries_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiry_entries" ADD CONSTRAINT "site_enquiry_entries_tenant_id_enquiry_id_fkey" FOREIGN KEY ("tenant_id","enquiry_id") REFERENCES "core"."site_enquiries"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiry_entries" ADD CONSTRAINT "site_enquiry_entries_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_source_check" CHECK (source in ('website', 'phone', 'email', 'walk_in', 'event', 'referral', 'other'));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_reach_check" CHECK (email <> '' or phone <> '');--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_child_name_check" CHECK (char_length(child_name) <= 120);--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_answers_check" CHECK (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 32768);--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_state_check" CHECK (state in ('open', 'in_progress', 'converted', 'closed'));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_closed_reason_check" CHECK (closed_reason in ('answered', 'not_interested', 'another_school', 'not_eligible', 'no_places', 'no_response', 'duplicate', 'spam', 'other'));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_closed_check" CHECK ((state = 'closed') = (closed_reason is not null));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_website_check" CHECK ((source = 'website') = (created_by_user_id is null));--> statement-breakpoint
ALTER TABLE "core"."access_roles" DROP CONSTRAINT "access_roles_builtin_key_check", ADD CONSTRAINT "access_roles_builtin_key_check" CHECK (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal', 'teacher', 'aide', 'counselor', 'proctor', 'staff', 'student', 'family', 'admissions_officer'));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" DROP CONSTRAINT "site_enquiries_email_check", ADD CONSTRAINT "site_enquiries_email_check" CHECK (email = '' or (char_length(email) between 3 and 254 and email like '%_@_%'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_enquiry_entries" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_enquiry_entries" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_enquiry_entries" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_enquiry_entries" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "p_site_insert" ON "core"."site_enquiries" TO "site" WITH CHECK (status = 'active' and source = 'website' and state = 'open'
        and closed_reason is null and assignee_user_id is null and first_responded_at is null
        and created_by_user_id is null and family_user_id is null and applicant_user_id is null
        and handled_at is null);