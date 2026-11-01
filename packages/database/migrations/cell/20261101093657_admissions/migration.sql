CREATE TABLE "core"."admission_applications" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"form_version_id" uuid NOT NULL,
	"family_user_id" uuid NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"enquiry_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"exit_reason" text,
	"reference" text,
	"locale" text NOT NULL,
	"form" jsonb NOT NULL,
	"answers" jsonb DEFAULT '[]' NOT NULL,
	"additional_needs" boolean DEFAULT false NOT NULL,
	"priorities" text[] DEFAULT '{}'::text[] NOT NULL,
	"matches" jsonb DEFAULT '{}' NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_applications_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_applications_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_applications_version_check" CHECK (version > 0),
	CONSTRAINT "admission_applications_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_applications_state_check" CHECK (state in ('draft', 'submitted', 'in_review', 'decided', 'offered', 'accepted', 'enrolled', 'waitlisted', 'declined_by_school', 'withdrawn', 'offer_declined', 'offer_expired', 'deferred')),
	CONSTRAINT "admission_applications_exit_reason_check" CHECK (char_length(exit_reason) between 1 and 40),
	CONSTRAINT "admission_applications_reference_check" CHECK (reference ~ '^[0-9]{4}-[0-9]{4,6}$'),
	CONSTRAINT "admission_applications_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "admission_applications_form_check" CHECK (jsonb_typeof(form) = 'object' and octet_length(form::text) <= 65536),
	CONSTRAINT "admission_applications_answers_check" CHECK (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 98304),
	CONSTRAINT "admission_applications_matches_check" CHECK (jsonb_typeof(matches) = 'object' and octet_length(matches::text) <= 16384),
	CONSTRAINT "admission_applications_priorities_check" CHECK (priorities <@ array['sibling', 'staff_child', 'returning_student', 'additional_needs']),
	CONSTRAINT "admission_applications_sent_check" CHECK ((state = 'draft' or (state = 'withdrawn' and submitted_at is null)) = (submitted_at is null)
        and (submitted_at is null) = (reference is null))
);
--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_entries" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_entries_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_entries_kind_check" CHECK (kind in ('note', 'state', 'item')),
	CONSTRAINT "admission_entries_body_check" CHECK (char_length(body) <= 4000),
	CONSTRAINT "admission_entries_details_check" CHECK (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
);
--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_form_versions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"questions" jsonb NOT NULL,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_form_versions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_form_versions_tenant_id_form_id_number_key" UNIQUE("tenant_id","form_id","number"),
	CONSTRAINT "admission_form_versions_number_check" CHECK (number > 0),
	CONSTRAINT "admission_form_versions_questions_check" CHECK (jsonb_typeof(questions) = 'array' and octet_length(questions::text) <= 131072)
);
--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_forms" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"questions" jsonb DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_forms_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_forms_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_forms_version_check" CHECK (version > 0),
	CONSTRAINT "admission_forms_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_forms_names_check" CHECK ((name_en <> '' or name_ar <> '') and char_length(name_en) <= 120 and char_length(name_ar) <= 120),
	CONSTRAINT "admission_forms_questions_check" CHECK (jsonb_typeof(questions) = 'array' and octet_length(questions::text) <= 131072)
);
--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_intakes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"opens_on" date NOT NULL,
	"closes_on" date NOT NULL,
	"capacity" integer NOT NULL,
	"form_id" uuid NOT NULL,
	"checklist" jsonb DEFAULT '[]' NOT NULL,
	"currency" text NOT NULL,
	"fees" jsonb DEFAULT '[]' NOT NULL,
	"decisions_on" date,
	"offer_days" smallint NOT NULL,
	"age_cutoff_on" date NOT NULL,
	"min_age_months" smallint,
	"max_age_months" smallint,
	"priorities" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_intakes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_intakes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_intakes_version_check" CHECK (version > 0),
	CONSTRAINT "admission_intakes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_intakes_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "admission_intakes_window_check" CHECK (opens_on <= closes_on),
	CONSTRAINT "admission_intakes_capacity_check" CHECK (capacity between 1 and 5000),
	CONSTRAINT "admission_intakes_checklist_check" CHECK (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 20),
	CONSTRAINT "admission_intakes_currency_check" CHECK (currency in ('EGP', 'USD', 'EUR', 'GBP', 'AED', 'SAR')),
	CONSTRAINT "admission_intakes_fees_check" CHECK (jsonb_typeof(fees) = 'array' and jsonb_array_length(fees) <= 5),
	CONSTRAINT "admission_intakes_offer_days_check" CHECK (offer_days between 1 and 120),
	CONSTRAINT "admission_intakes_ages_check" CHECK ((min_age_months is null or min_age_months between 0 and 300)
        and (max_age_months is null or max_age_months between 0 and 300)
        and (min_age_months is null or max_age_months is null or min_age_months <= max_age_months)),
	CONSTRAINT "admission_intakes_priorities_check" CHECK (priorities <@ array['sibling', 'staff_child', 'returning_student', 'additional_needs'])
);
--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_items" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"item_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"label_en" text NOT NULL,
	"label_ar" text NOT NULL,
	"required" boolean NOT NULL,
	"position" smallint NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_items_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_items_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_items_version_check" CHECK (version > 0),
	CONSTRAINT "admission_items_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_items_kind_check" CHECK (kind in ('document', 'assessment', 'interview', 'fee', 'reference')),
	CONSTRAINT "admission_items_labels_check" CHECK ((label_en <> '' or label_ar <> '') and char_length(label_en) <= 120 and char_length(label_ar) <= 120),
	CONSTRAINT "admission_items_position_check" CHECK (position between 0 and 99),
	CONSTRAINT "admission_items_state_check" CHECK (state in ('pending', 'received', 'verified', 'waived', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "core"."admission_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ADD COLUMN "applicant_months" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "admission_applications_applicant_key" ON "core"."admission_applications" ("tenant_id","intake_id","applicant_user_id") WHERE status = 'active' and state <> 'withdrawn';--> statement-breakpoint
CREATE UNIQUE INDEX "admission_applications_reference_key" ON "core"."admission_applications" ("tenant_id","org_id","reference") WHERE reference is not null;--> statement-breakpoint
CREATE INDEX "admission_applications_intake_idx" ON "core"."admission_applications" ("tenant_id","intake_id","state") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_applications_family_idx" ON "core"."admission_applications" ("tenant_id","family_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_applications_applicant_idx" ON "core"."admission_applications" ("tenant_id","applicant_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_entries_application_idx" ON "core"."admission_entries" ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "admission_forms_org_idx" ON "core"."admission_forms" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "admission_intakes_grade_key" ON "core"."admission_intakes" ("tenant_id","org_id","school_year_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_intakes_window_idx" ON "core"."admission_intakes" ("tenant_id","org_id","opens_on","closes_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "admission_items_key" ON "core"."admission_items" ("tenant_id","application_id","item_key") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_intake_id_fkey" FOREIGN KEY ("tenant_id","intake_id") REFERENCES "core"."admission_intakes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_form_version_id_fkey" FOREIGN KEY ("tenant_id","form_version_id") REFERENCES "core"."admission_form_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_family_user_id_fkey" FOREIGN KEY ("tenant_id","family_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_applicant_user_id_fkey" FOREIGN KEY ("tenant_id","applicant_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_enquiry_id_fkey" FOREIGN KEY ("tenant_id","enquiry_id") REFERENCES "core"."site_enquiries"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_form_id_fkey" FOREIGN KEY ("tenant_id","form_id") REFERENCES "core"."admission_forms"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_published_by_user_id_fkey" FOREIGN KEY ("tenant_id","published_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ADD CONSTRAINT "admission_intakes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ADD CONSTRAINT "admission_intakes_tenant_id_school_year_id_school_year_typ_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ADD CONSTRAINT "admission_intakes_tenant_id_grade_level_descriptor_id_grad_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ADD CONSTRAINT "admission_intakes_tenant_id_form_id_fkey" FOREIGN KEY ("tenant_id","form_id") REFERENCES "core"."admission_forms"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_items" ADD CONSTRAINT "admission_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_items" ADD CONSTRAINT "admission_items_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_items" ADD CONSTRAINT "admission_items_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ADD CONSTRAINT "retention_settings_applicant_months_check" CHECK (applicant_months between 1 and 120);--> statement-breakpoint
ALTER TABLE "core"."access_roles" DROP CONSTRAINT "access_roles_builtin_key_check", ADD CONSTRAINT "access_roles_builtin_key_check" CHECK (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal', 'teacher', 'aide', 'counselor', 'proctor', 'staff', 'student', 'family', 'admissions_officer', 'applicant_family'));--> statement-breakpoint
ALTER TABLE "core"."files" DROP CONSTRAINT "files_purpose_check", ADD CONSTRAINT "files_purpose_check" CHECK (purpose in ('document_media', 'attachment', 'submission', 'avatar', 'logo', 'site_media', 'health_report', 'legal_document', 'evidence', 'import_source', 'export', 'admission_document'));--> statement-breakpoint
ALTER TABLE "core"."sessions" DROP CONSTRAINT "sessions_active_role_check", ADD CONSTRAINT "sessions_active_role_check" CHECK (active_role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative', 'applicant_family'));--> statement-breakpoint
ALTER TABLE "core"."user_roles" DROP CONSTRAINT "user_roles_role_check", ADD CONSTRAINT "user_roles_role_check" CHECK (role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative', 'applicant_family'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_applications" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_applications" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_applications" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_applications" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_applications" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."admission_applications" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "applicant_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_entries" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_entries" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_entries" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_entries" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_form_versions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_form_versions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_form_versions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_form_versions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_forms" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_forms" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_forms" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_forms" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_forms" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_intakes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_intakes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_intakes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_intakes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_intakes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_items" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_items" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_items" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_items" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_items" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);