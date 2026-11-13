CREATE TABLE "core"."absence_reports" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"span" daterange NOT NULL,
	"at" time,
	"reason_descriptor_id" uuid NOT NULL,
	"reason_ns" text GENERATED ALWAYS AS ('attendance_reason') STORED NOT NULL,
	"note" text,
	"file_id" uuid,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "absence_reports_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "absence_reports_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "absence_reports_version_check" CHECK (version > 0),
	CONSTRAINT "absence_reports_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "absence_reports_span_check" CHECK (not isempty("span") and not lower_inf("span") and not upper_inf("span") and lower_inc("span") and not upper_inc("span")),
	CONSTRAINT "absence_reports_kind_check" CHECK (kind in ('absent', 'late', 'early') and (kind = 'absent') = (at is null)
        and (kind = 'absent' or upper(span) - lower(span) = 1)),
	CONSTRAINT "absence_reports_decision_check" CHECK (decision in ('pending', 'accepted', 'declined', 'withdrawn')
        and (decision in ('pending', 'withdrawn')) = (decided_at is null)),
	CONSTRAINT "absence_reports_note_check" CHECK (char_length(note) between 1 and 1000),
	CONSTRAINT "absence_reports_decision_note_check" CHECK (char_length(decision_note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."academic_sessions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"parent_type" text,
	"school_year_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"span" daterange NOT NULL,
	"school_year" smallint NOT NULL,
	"lifecycle" text,
	"reenrolment_opened_at" timestamp with time zone,
	"sequence" smallint DEFAULT 1 NOT NULL,
	"target_days" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "academic_sessions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "academic_sessions_tenant_id_id_type_school_year_id_org_id_key" UNIQUE("tenant_id","id","type","school_year_id","org_id"),
	CONSTRAINT "academic_sessions_tenant_id_id_type_school_year_id_org_id_s_key" UNIQUE("tenant_id","id","type","school_year_id","org_id","school_year"),
	CONSTRAINT "academic_sessions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "academic_sessions_version_check" CHECK (version > 0),
	CONSTRAINT "academic_sessions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "academic_sessions_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "academic_sessions_type_check" CHECK (type in ('school_year', 'semester', 'term', 'grading_period')),
	CONSTRAINT "academic_sessions_title_en_check" CHECK (char_length(title_en) between 1 and 80),
	CONSTRAINT "academic_sessions_title_ar_check" CHECK (char_length(title_ar) between 1 and 80),
	CONSTRAINT "academic_sessions_school_year_check" CHECK (school_year between 2000 and 2200),
	CONSTRAINT "academic_sessions_lifecycle_check" CHECK (lifecycle in ('upcoming', 'current', 'closed')),
	CONSTRAINT "academic_sessions_sequence_check" CHECK (sequence between 1 and 99),
	CONSTRAINT "academic_sessions_target_days_check" CHECK (target_days is null or (type = 'school_year' and target_days between 1 and 366)),
	CONSTRAINT "academic_sessions_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1),
	CONSTRAINT "academic_sessions_span_check" CHECK (not isempty("span") and not lower_inf("span") and not upper_inf("span") and lower_inc("span") and not upper_inc("span")),
	CONSTRAINT "academic_sessions_parent_pair_check" CHECK ((parent_id is null) = (parent_type is null)),
	CONSTRAINT "academic_sessions_tree_check" CHECK ((type = 'school_year' and parent_id is null and school_year_id = id) or (type = 'semester' and parent_type = 'school_year') or (type = 'term' and parent_type in ('school_year', 'semester')) or (type = 'grading_period' and parent_type in ('school_year', 'semester', 'term'))),
	CONSTRAINT "academic_sessions_year_end_check" CHECK (type <> 'school_year' or school_year = extract(year from upper(span) - 1)),
	CONSTRAINT "academic_sessions_lifecycle_type_check" CHECK ((type = 'school_year') = (lifecycle is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."academic_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."academic_weeks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"number" smallint NOT NULL,
	"span" daterange NOT NULL,
	"label_en" text,
	"label_ar" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "academic_weeks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "academic_weeks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "academic_weeks_version_check" CHECK (version > 0),
	CONSTRAINT "academic_weeks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "academic_weeks_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "academic_weeks_number_check" CHECK (number between 1 and 60),
	CONSTRAINT "academic_weeks_label_en_check" CHECK (char_length(label_en) between 1 and 40),
	CONSTRAINT "academic_weeks_label_ar_check" CHECK (char_length(label_ar) between 1 and 40),
	CONSTRAINT "academic_weeks_span_check" CHECK (not isempty("span") and not lower_inf("span") and not upper_inf("span") and lower_inc("span") and not upper_inc("span") and upper(span) - lower(span) <= 7)
);
--> statement-breakpoint
ALTER TABLE "core"."academic_weeks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."access_arrangements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"extra_time" smallint DEFAULT 0 NOT NULL,
	"unlimited_time" boolean DEFAULT false NOT NULL,
	"read_aloud" boolean DEFAULT false NOT NULL,
	"fewer_choices" boolean DEFAULT false NOT NULL,
	"rest_breaks" boolean DEFAULT false NOT NULL,
	"extension_days" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "access_arrangements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "access_arrangements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "access_arrangements_version_check" CHECK (version > 0),
	CONSTRAINT "access_arrangements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "access_arrangements_extra_time_check" CHECK (extra_time in (0, 10, 25, 50, 100)),
	CONSTRAINT "access_arrangements_extension_days_check" CHECK (extension_days between 0 and 14)
);
--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."access_role_assignments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"access_role_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"valid_during" daterange NOT NULL,
	"replaces_builtin" boolean DEFAULT false NOT NULL,
	"granted_by_user_id" uuid,
	"reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "access_role_assignments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "access_role_assignments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "access_role_assignments_version_check" CHECK (version > 0),
	CONSTRAINT "access_role_assignments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "access_role_assignments_reason_check" CHECK (char_length(reason) between 1 and 500),
	CONSTRAINT "access_role_assignments_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."access_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."access_roles" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid,
	"builtin_key" text,
	"name_en" text,
	"name_ar" text,
	"description_en" text,
	"description_ar" text,
	"capabilities" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "access_roles_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "access_roles_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "access_roles_version_check" CHECK (version > 0),
	CONSTRAINT "access_roles_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "access_roles_builtin_key_check" CHECK (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal', 'teacher', 'aide', 'counselor', 'proctor', 'staff', 'student', 'family', 'admissions_officer', 'applicant_family', 'applicant')),
	CONSTRAINT "access_roles_name_en_check" CHECK (char_length(name_en) between 1 and 80),
	CONSTRAINT "access_roles_name_ar_check" CHECK (char_length(name_ar) between 1 and 80),
	CONSTRAINT "access_roles_description_en_check" CHECK (char_length(description_en) between 1 and 500),
	CONSTRAINT "access_roles_description_ar_check" CHECK (char_length(description_ar) between 1 and 500),
	CONSTRAINT "access_roles_capabilities_check" CHECK (array_to_string(capabilities, ',') ~ '^([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*(,[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)*)?$'),
	CONSTRAINT "access_roles_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."access_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."accounts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"state" text DEFAULT 'invited' NOT NULL,
	"webauthn_user_handle" bytea NOT NULL,
	"first_authenticated_at" timestamp with time zone,
	"last_authenticated_at" timestamp with time zone,
	"state_changed_at" timestamp with time zone,
	"state_changed_by_user_id" uuid,
	"state_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "accounts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "accounts_tenant_id_webauthn_user_handle_key" UNIQUE("tenant_id","webauthn_user_handle"),
	CONSTRAINT "accounts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "accounts_version_check" CHECK (version > 0),
	CONSTRAINT "accounts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "accounts_state_check" CHECK (state in ('invited', 'active', 'disabled', 'locked')),
	CONSTRAINT "accounts_state_reason_check" CHECK (char_length(state_reason) between 1 and 500),
	CONSTRAINT "accounts_handle_check" CHECK (octet_length(webauthn_user_handle) = 64 and substring(webauthn_user_handle from 1 for 16) = uuid_send(tenant_id))
);
--> statement-breakpoint
ALTER TABLE "core"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_applications" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"form_version_id" uuid NOT NULL,
	"filed_by_user_id" uuid NOT NULL,
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
	"decision" text,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"released_at" timestamp with time zone,
	"offer_expires_on" date,
	"answered_at" timestamp with time zone,
	"student_user_id" uuid,
	"deferred_from_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_applications_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_applications_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_applications_version_check" CHECK (version > 0),
	CONSTRAINT "admission_applications_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_applications_decision_check" CHECK (decision in ('offer', 'waitlist', 'decline')),
	CONSTRAINT "admission_applications_decided_check" CHECK ((state <> 'decided' or (decision is not null and released_at is null))
        and (decision is null) = (decided_at is null)),
	CONSTRAINT "admission_applications_offered_check" CHECK (state <> 'offered' or offer_expires_on is not null),
	CONSTRAINT "admission_applications_enrolled_check" CHECK ((state = 'enrolled') = (student_user_id is not null)),
	CONSTRAINT "admission_applications_state_check" CHECK (state in ('draft', 'submitted', 'in_review', 'decided', 'offered', 'accepted', 'enrolled', 'waitlisted', 'declined_by_school', 'withdrawn', 'offer_declined', 'offer_expired', 'deferred')),
	CONSTRAINT "admission_applications_exit_reason_check" CHECK (char_length(exit_reason) between 1 and 40),
	CONSTRAINT "admission_applications_reference_check" CHECK (reference ~ '^[0-9]{4}-[0-9]{4,6}$'),
	CONSTRAINT "admission_applications_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "admission_applications_form_check" CHECK (jsonb_typeof(form) = 'object' and octet_length(form::text) <= 131072),
	CONSTRAINT "admission_applications_answers_check" CHECK (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 262144),
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
	CONSTRAINT "admission_entries_kind_check" CHECK (kind in ('note', 'state', 'item', 'event')),
	CONSTRAINT "admission_entries_body_check" CHECK (char_length(body) <= 4000),
	CONSTRAINT "admission_entries_details_check" CHECK (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
);
--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "core"."admission_form_versions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"primary_locale" text NOT NULL,
	"body" jsonb NOT NULL,
	"translation" jsonb,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_form_versions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_form_versions_tenant_id_form_id_number_key" UNIQUE("tenant_id","form_id","number"),
	CONSTRAINT "admission_form_versions_number_check" CHECK (number > 0),
	CONSTRAINT "admission_form_versions_primary_locale_check" CHECK (primary_locale in ('en', 'ar')),
	CONSTRAINT "admission_form_versions_body_check" CHECK (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144),
	CONSTRAINT "admission_form_versions_translation_check" CHECK (translation is null or (jsonb_typeof(translation) = 'object' and octet_length(translation::text) <= 262144))
);
--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_forms" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"primary_locale" text DEFAULT 'en' NOT NULL,
	"body" jsonb NOT NULL,
	"translation" jsonb,
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
	CONSTRAINT "admission_forms_primary_locale_check" CHECK (primary_locale in ('en', 'ar')),
	CONSTRAINT "admission_forms_body_check" CHECK (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144),
	CONSTRAINT "admission_forms_translation_check" CHECK (translation is null or (jsonb_typeof(translation) = 'object' and octet_length(translation::text) <= 262144))
);
--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."admission_intakes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"starts_on" date NOT NULL,
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
	"letters" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "admission_intakes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "admission_intakes_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "admission_intakes_letters_check" CHECK (jsonb_typeof(letters) = 'object' and octet_length(letters::text) <= 4096),
	CONSTRAINT "admission_intakes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "admission_intakes_version_check" CHECK (version > 0),
	CONSTRAINT "admission_intakes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "admission_intakes_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "admission_intakes_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "admission_intakes_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1),
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
CREATE TABLE "audit"."anchors" (
	"tenant_id" uuid,
	"batch_no" bigint,
	"anchored_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"object_key" text NOT NULL,
	"object_version_id" text NOT NULL,
	CONSTRAINT "anchors_pkey" PRIMARY KEY("tenant_id","batch_no"),
	CONSTRAINT "anchors_object_key_check" CHECK (char_length(object_key) between 1 and 1024),
	CONSTRAINT "anchors_object_version_id_check" CHECK (char_length(object_version_id) between 1 and 1024)
);
--> statement-breakpoint
ALTER TABLE "audit"."anchors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assessments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"attempt_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"score" numeric(7,2),
	"effective_score" numeric(7,2),
	"rubric_scores" jsonb,
	"rubric_comments" jsonb,
	"grade_scale_version_id" uuid,
	"feedback" text,
	"private_note" text,
	"graded_by_user_id" uuid,
	"graded_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"released_at" timestamp with time zone,
	"comments_released_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assessments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assessments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assessments_version_check" CHECK (version > 0),
	CONSTRAINT "assessments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assessments_score_check" CHECK (score is null or score >= 0),
	CONSTRAINT "assessments_effective_score_check" CHECK (effective_score is null or effective_score >= 0),
	CONSTRAINT "assessments_rubric_scores_check" CHECK (rubric_scores is null or jsonb_typeof(rubric_scores) = 'object'),
	CONSTRAINT "assessments_rubric_comments_check" CHECK (rubric_comments is null or jsonb_typeof(rubric_comments) = 'object'),
	CONSTRAINT "assessments_feedback_check" CHECK (char_length(feedback) between 1 and 10000),
	CONSTRAINT "assessments_private_note_check" CHECK (char_length(private_note) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assignment_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"group_id" uuid,
	"due_at" timestamp with time zone,
	"due_arranged" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assignment_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assignment_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "assignment_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assignment_recipients_source_check" CHECK (source in ('class', 'group', 'student')),
	CONSTRAINT "assignment_recipients_group_check" CHECK ((source = 'group') = (group_id is not null)),
	CONSTRAINT "assignment_recipients_due_arranged_check" CHECK (not due_arranged or due_at is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assignment_terms" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"grading_period_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assignment_terms_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assignment_terms_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assignment_terms_version_check" CHECK (version > 0),
	CONSTRAINT "assignment_terms_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."assignment_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."assignments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"category_id" uuid,
	"author_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"audience" text DEFAULT 'class' NOT NULL,
	"available_from" timestamp with time zone,
	"due_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"late_policy" text DEFAULT 'accept' NOT NULL,
	"late_deduction_percent" smallint,
	"submission_format" text DEFAULT 'both' NOT NULL,
	"max_files" smallint DEFAULT 5 NOT NULL,
	"resubmission" boolean DEFAULT false NOT NULL,
	"points" numeric(7,2),
	"rubric" jsonb,
	"quiz_attempts" smallint,
	"quiz_keep" text,
	"quiz_reveal" text,
	"quiz_shuffle" boolean DEFAULT false NOT NULL,
	"quiz_time_limit" smallint,
	"quiz_practice" boolean DEFAULT false NOT NULL,
	"quiz_bands" jsonb DEFAULT '[]' NOT NULL,
	"grade_after_answers" boolean DEFAULT false NOT NULL,
	"discussion_post_first" boolean,
	"discussion_replies" smallint,
	"language" text,
	"translation_title" text,
	"translation_reviewed_at" timestamp with time zone,
	"translation_reviewed_by_user_id" uuid,
	"translation_source_digest" text,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "assignments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "assignments_tenant_id_id_class_id_status_key" UNIQUE("tenant_id","id","class_id","status"),
	CONSTRAINT "assignments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "assignments_version_check" CHECK (version > 0),
	CONSTRAINT "assignments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "assignments_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "assignments_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "assignments_audience_check" CHECK (audience in ('class', 'selected')),
	CONSTRAINT "assignments_quiz_time_limit_check" CHECK (quiz_time_limit is null or quiz_time_limit between 1 and 480),
	CONSTRAINT "assignments_late_policy_check" CHECK (late_policy in ('accept', 'deduct', 'refuse')),
	CONSTRAINT "assignments_late_deduction_check" CHECK ((late_policy = 'deduct') = (late_deduction_percent is not null) and (late_deduction_percent is null or late_deduction_percent between 1 and 100)),
	CONSTRAINT "assignments_submission_format_check" CHECK (submission_format in ('online', 'files', 'both', 'online_and_files', 'none', 'quiz', 'discussion')),
	CONSTRAINT "assignments_discussion_check" CHECK ((submission_format = 'discussion') = (discussion_post_first is not null and discussion_replies is not null) and (discussion_replies is null or discussion_replies between 0 and 5)),
	CONSTRAINT "assignments_language_check" CHECK (language in ('en', 'ar')),
	CONSTRAINT "assignments_translation_title_check" CHECK (translation_title is null or (language is not null and char_length(translation_title) between 1 and 200)),
	CONSTRAINT "assignments_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)),
	CONSTRAINT "assignments_quiz_check" CHECK ((submission_format = 'quiz') = (quiz_keep is not null and quiz_reveal is not null) and (quiz_attempts is null or quiz_attempts between 1 and 10) and (quiz_keep is null or quiz_keep in ('highest', 'latest', 'average', 'first')) and (quiz_reveal is null or quiz_reveal in ('answers', 'feedback', 'marks', 'returned'))),
	CONSTRAINT "assignments_quiz_practice_check" CHECK (not quiz_practice or submission_format = 'quiz'),
	CONSTRAINT "assignments_quiz_bands_check" CHECK (jsonb_typeof(quiz_bands) = 'array' and jsonb_array_length(quiz_bands) <= 6),
	CONSTRAINT "assignments_max_files_check" CHECK (max_files between 1 and 20),
	CONSTRAINT "assignments_points_check" CHECK (points is null or points > 0),
	CONSTRAINT "assignments_rubric_check" CHECK (rubric is null or (jsonb_typeof(rubric) = 'object' and octet_length(rubric::text) <= 65536)),
	CONSTRAINT "assignments_dates_check" CHECK ((available_from is null or due_at is null or due_at >= available_from) and (due_at is null or closes_at is null or closes_at >= due_at) and (available_from is null or closes_at is null or closes_at >= available_from)),
	CONSTRAINT "assignments_published_check" CHECK (state <> 'published' or published_at is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "core"."attendance_registers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"daily" boolean NOT NULL,
	"taken_on" date NOT NULL,
	"span" daterange GENERATED ALWAYS AS (daterange(taken_on, taken_on + 1, '[)')) STORED NOT NULL,
	"state" text NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attendance_registers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attendance_registers_tenant_id_id_taken_on_key" UNIQUE("tenant_id","id","taken_on"),
	CONSTRAINT "attendance_registers_tenant_id_id_class_id_taken_on_key" UNIQUE("tenant_id","id","class_id","taken_on"),
	CONSTRAINT "attendance_registers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attendance_registers_version_check" CHECK (version > 0),
	CONSTRAINT "attendance_registers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attendance_registers_kind_check" CHECK (kind in ('day', 'period')),
	CONSTRAINT "attendance_registers_daily_check" CHECK (kind = 'period' or daily),
	CONSTRAINT "attendance_registers_state_check" CHECK (state in ('in_progress', 'submitted')),
	CONSTRAINT "attendance_registers_submitted_at_check" CHECK ((state = 'submitted') = (submitted_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."attendance_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"teacher_edit_days" smallint NOT NULL,
	"notice_delay_minutes" smallint NOT NULL,
	"chronic_percent" smallint NOT NULL,
	"check_in_touch" boolean DEFAULT false NOT NULL,
	"check_in_qr" boolean DEFAULT false NOT NULL,
	"check_in_nfc" boolean DEFAULT false NOT NULL,
	"late_after_minutes" smallint DEFAULT 5 NOT NULL,
	"register_closes_minutes" smallint DEFAULT 30 NOT NULL,
	"learners_report" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "attendance_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "attendance_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "attendance_settings_version_check" CHECK (version > 0),
	CONSTRAINT "attendance_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "attendance_settings_teacher_edit_days_check" CHECK (teacher_edit_days between 0 and 60),
	CONSTRAINT "attendance_settings_notice_delay_minutes_check" CHECK (notice_delay_minutes between 0 and 1440),
	CONSTRAINT "attendance_settings_chronic_percent_check" CHECK (chronic_percent between 1 and 50),
	CONSTRAINT "attendance_settings_lateness_check" CHECK (late_after_minutes between 0 and 60
        and register_closes_minutes between 5 and 240
        and late_after_minutes < register_closes_minutes)
);
--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."auth_attempts" (
	"tenant_id" uuid,
	"key_hash" bytea,
	"count" integer DEFAULT 1 NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_attempts_pkey" PRIMARY KEY("tenant_id","key_hash"),
	CONSTRAINT "auth_attempts_key_hash_check" CHECK (octet_length(key_hash) = 32),
	CONSTRAINT "auth_attempts_count_check" CHECK (count > 0)
);
--> statement-breakpoint
ALTER TABLE "core"."auth_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."bank_comments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "bank_comments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "bank_comments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "bank_comments_version_check" CHECK (version > 0),
	CONSTRAINT "bank_comments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "bank_comments_body_check" CHECK (char_length(body) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."bank_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."bank_questions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "bank_questions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "bank_questions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "bank_questions_version_check" CHECK (version > 0),
	CONSTRAINT "bank_questions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "bank_questions_scope_check" CHECK (scope in ('mine', 'school')),
	CONSTRAINT "bank_questions_kind_check" CHECK (kind ~ '^[a-z]{2,20}$'),
	CONSTRAINT "bank_questions_title_check" CHECK (char_length(title) between 1 and 300),
	CONSTRAINT "bank_questions_tags_check" CHECK (cardinality(tags) <= 8)
);
--> statement-breakpoint
ALTER TABLE "core"."bank_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."bell_schedules" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name_en" text,
	"name_ar" text,
	"times" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "bell_schedules_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "bell_schedules_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "bell_schedules_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "bell_schedules_version_check" CHECK (version > 0),
	CONSTRAINT "bell_schedules_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "bell_schedules_name_en_check" CHECK (char_length(name_en) between 1 and 60),
	CONSTRAINT "bell_schedules_name_ar_check" CHECK (char_length(name_ar) between 1 and 60),
	CONSTRAINT "bell_schedules_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "bell_schedules_times_check" CHECK (jsonb_typeof(times) = 'array' and jsonb_array_length(times) between 0 and 50)
);
--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "core"."broadcast_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"broadcast_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcast_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcast_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcast_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "broadcast_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "broadcast_audiences_scope_check" CHECK (scope in ('school', 'staff', 'students', 'class')),
	CONSTRAINT "broadcast_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."broadcast_families" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"broadcast_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcast_families_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcast_families_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcast_families_version_check" CHECK (version > 0),
	CONSTRAINT "broadcast_families_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."broadcast_families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."broadcast_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"broadcast_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcast_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcast_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcast_grades_version_check" CHECK (version > 0),
	CONSTRAINT "broadcast_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."broadcast_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."broadcast_recipients" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcast_recipients_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcast_recipients_version_check" CHECK (version > 0),
	CONSTRAINT "broadcast_recipients_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."broadcasts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"told_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"translation_reviewed_at" timestamp with time zone,
	"translation_reviewed_by_user_id" uuid,
	"translation_source_digest" text,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"pinned_until" date,
	"expires_on" date,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"ack_due_on" date,
	"update_sent_at" timestamp with time zone,
	"excerpt_en" text DEFAULT '' NOT NULL,
	"excerpt_ar" text DEFAULT '' NOT NULL,
	"cover_file_id" uuid,
	"cover_alt_en" text DEFAULT '' NOT NULL,
	"cover_alt_ar" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "broadcasts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "broadcasts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "broadcasts_version_check" CHECK (version > 0),
	CONSTRAINT "broadcasts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "broadcasts_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "broadcasts_publish_at_check" CHECK ((state <> 'published' or publish_at is not null) and (state <> 'draft' or publish_at is null)),
	CONSTRAINT "broadcasts_told_at_check" CHECK (told_at is null or state <> 'draft'),
	CONSTRAINT "broadcasts_title_check" CHECK (char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')),
	CONSTRAINT "broadcasts_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)),
	CONSTRAINT "broadcasts_urgency_check" CHECK (urgency in ('normal', 'important', 'urgent')),
	CONSTRAINT "broadcasts_ack_due_on_check" CHECK (ack_due_on is null or requires_ack),
	CONSTRAINT "broadcasts_excerpt_check" CHECK (char_length(excerpt_en) <= 300 and char_length(excerpt_ar) <= 300),
	CONSTRAINT "broadcasts_cover_alt_check" CHECK (char_length(cover_alt_en) <= 300 and char_length(cover_alt_ar) <= 300)
);
--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_dates" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"span" daterange GENERATED ALWAYS AS (daterange(day_on, day_on + 1, '[)')) STORED NOT NULL,
	"event_descriptor_id" uuid NOT NULL,
	"event_ns" text GENERATED ALWAYS AS ('calendar_event') STORED NOT NULL,
	"note_en" text,
	"note_ar" text,
	"provisional" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_dates_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_dates_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_dates_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_dates_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_dates_note_en_check" CHECK (char_length(note_en) between 1 and 200),
	CONSTRAINT "calendar_dates_note_ar_check" CHECK (char_length(note_ar) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_event_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"event_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_event_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_event_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_event_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_event_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_event_audiences_scope_check" CHECK (scope in ('school', 'staff', 'students', 'class')),
	CONSTRAINT "calendar_event_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_event_families" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"event_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_event_families_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_event_families_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_event_families_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_event_families_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_event_families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_event_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"event_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_event_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_event_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_event_grades_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_event_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_event_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_events" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"category" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"location" text,
	"provisional" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'published' NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"update_sent_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"translation_reviewed_at" timestamp with time zone,
	"translation_reviewed_by_user_id" uuid,
	"translation_source_digest" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_events_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_events_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_events_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_events_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_events_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)),
	CONSTRAINT "calendar_events_title_en_check" CHECK (char_length(title_en) between 1 and 200),
	CONSTRAINT "calendar_events_title_ar_check" CHECK (char_length(title_ar) between 1 and 200),
	CONSTRAINT "calendar_events_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1),
	CONSTRAINT "calendar_events_category_check" CHECK (category in ('general', 'meeting', 'trip', 'performance', 'sport', 'exam', 'celebration')),
	CONSTRAINT "calendar_events_location_check" CHECK (location is null or char_length(location) between 1 and 200),
	CONSTRAINT "calendar_events_ends_on_check" CHECK (ends_on >= starts_on),
	CONSTRAINT "calendar_events_state_check" CHECK (state in ('draft', 'published')),
	CONSTRAINT "calendar_events_times_check" CHECK ((start_time is null) = (end_time is null)
        and (start_time is null or ends_on > starts_on or end_time > start_time))
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_feeds" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_feeds_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_feeds_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_feeds_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_feeds_token_hash_check" CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."caption_drafts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"language" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"leased_until" timestamp with time zone,
	"progress" real,
	"error" text,
	"vtt" text,
	"requested_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "caption_drafts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "caption_drafts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "caption_drafts_version_check" CHECK (version > 0),
	CONSTRAINT "caption_drafts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "caption_drafts_language_check" CHECK (language in ('ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'pt', 'ru', 'tr', 'ur', 'zh')),
	CONSTRAINT "caption_drafts_state_check" CHECK (state in ('queued', 'working', 'ready', 'failed')),
	CONSTRAINT "caption_drafts_attempts_check" CHECK (attempts between 0 and 10),
	CONSTRAINT "caption_drafts_progress_check" CHECK (progress between 0 and 1),
	CONSTRAINT "caption_drafts_error_check" CHECK (char_length(error) <= 2000),
	CONSTRAINT "caption_drafts_vtt_check" CHECK (char_length(vtt) <= 524288),
	CONSTRAINT "caption_drafts_lease_check" CHECK ((state = 'working') = (leased_until is not null)),
	CONSTRAINT "caption_drafts_ready_check" CHECK ((state = 'ready') = (vtt is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_grades_version_check" CHECK (version > 0),
	CONSTRAINT "class_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."class_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_grading" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"programme_id" uuid,
	"programme_chosen" boolean DEFAULT true NOT NULL,
	"grade_scale_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_grading_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_grading_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_grading_version_check" CHECK (version > 0),
	CONSTRAINT "class_grading_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_grading_chosen_check" CHECK (num_nonnulls(programme_id, grade_scale_id) >= 1),
	CONSTRAINT "class_grading_programme_chosen_check" CHECK (programme_chosen or programme_id is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."class_grading" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_group_members" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"group_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_group_members_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_group_members_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_group_members_version_check" CHECK (version > 0),
	CONSTRAINT "class_group_members_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_groups" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"created_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_groups_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_groups_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_groups_version_check" CHECK (version > 0),
	CONSTRAINT "class_groups_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_groups_title_en_check" CHECK (char_length(title_en) between 1 and 80),
	CONSTRAINT "class_groups_title_ar_check" CHECK (char_length(title_ar) between 1 and 80),
	CONSTRAINT "class_groups_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."class_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_lesson_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"lesson_sounds" boolean NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_lesson_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_lesson_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_lesson_settings_version_check" CHECK (version > 0),
	CONSTRAINT "class_lesson_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."class_lesson_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_meetings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"timetable_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"class_period_id" uuid NOT NULL,
	"teacher_user_id" uuid,
	"location_id" uuid,
	"valid_during" daterange NOT NULL,
	"clash_accepted" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_meetings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_meetings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_meetings_version_check" CHECK (version > 0),
	CONSTRAINT "class_meetings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_meetings_weekday_check" CHECK (weekday between 1 and 28),
	CONSTRAINT "class_meetings_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_periods" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name_en" text,
	"name_ar" text,
	"sequence" smallint NOT NULL,
	"kind" text DEFAULT 'lesson' NOT NULL,
	"start_time" time,
	"end_time" time,
	"official_attendance" boolean DEFAULT false NOT NULL,
	"weekdays" smallint[] DEFAULT '{1,2,3,4,5,6,7}'::smallint[] NOT NULL,
	"day_times" jsonb DEFAULT '[]' NOT NULL,
	"valid_during" daterange NOT NULL,
	"bell_schedule_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_periods_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_periods_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "class_periods_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_periods_version_check" CHECK (version > 0),
	CONSTRAINT "class_periods_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_periods_code_check" CHECK (code ~ '^[A-Za-z0-9_-]{1,20}$'),
	CONSTRAINT "class_periods_name_en_check" CHECK (char_length(name_en) between 1 and 60),
	CONSTRAINT "class_periods_name_ar_check" CHECK (char_length(name_ar) between 1 and 60),
	CONSTRAINT "class_periods_sequence_check" CHECK (sequence between 1 and 50),
	CONSTRAINT "class_periods_kind_check" CHECK (kind in ('lesson', 'registration', 'break', 'other')),
	CONSTRAINT "class_periods_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "class_periods_times_check" CHECK ((start_time is null) = (end_time is null) and (end_time is null or end_time > start_time)),
	CONSTRAINT "class_periods_weekdays_check" CHECK (weekdays <@ '{1,2,3,4,5,6,7}' and cardinality(weekdays) between 1 and 7),
	CONSTRAINT "class_periods_day_times_check" CHECK (jsonb_typeof(day_times) = 'array' and jsonb_array_length(day_times) <= 6),
	CONSTRAINT "class_periods_valid_during_check" CHECK ((bell_schedule_id is null and not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
        or (bell_schedule_id is not null and lower_inf(valid_during) and upper_inf(valid_during))),
	CONSTRAINT "class_periods_extra_check" CHECK (bell_schedule_id is null or not official_attendance)
);
--> statement-breakpoint
ALTER TABLE "core"."class_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_running_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"shown" boolean NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_running_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_running_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_running_grades_version_check" CHECK (version > 0),
	CONSTRAINT "class_running_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."class_running_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_years" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_years_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_years_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_years_version_check" CHECK (version > 0),
	CONSTRAINT "class_years_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_years_school_year_type_check" CHECK (school_year_type = 'school_year')
);
--> statement-breakpoint
ALTER TABLE "core"."class_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"code" text NOT NULL,
	"title_en" text,
	"title_ar" text,
	"runs" daterange NOT NULL,
	"course_id" uuid,
	"subject_descriptor_id" uuid,
	"subject_ns" text GENERATED ALWAYS AS ('subject') STORED NOT NULL,
	"location_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "classes_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "classes_version_check" CHECK (version > 0),
	CONSTRAINT "classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "classes_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "classes_code_check" CHECK (code ~ '^[A-Za-z0-9_.-]{1,40}$'),
	CONSTRAINT "classes_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "classes_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "classes_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1),
	CONSTRAINT "classes_runs_check" CHECK (not isempty("runs") and not lower_inf("runs") and lower_inc("runs") and not upper_inc("runs"))
);
--> statement-breakpoint
ALTER TABLE "core"."classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."consent_guardians" (
	"tenant_id" uuid,
	"consent_record_id" uuid,
	"relationship_id" uuid NOT NULL,
	CONSTRAINT "consent_guardians_pkey" PRIMARY KEY("tenant_id","consent_record_id")
);
--> statement-breakpoint
ALTER TABLE "core"."consent_guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."consent_records" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"purpose_descriptor_id" uuid NOT NULL,
	"purpose_ns" text GENERATED ALWAYS AS ('consent_purpose') STORED NOT NULL,
	"decision" text NOT NULL,
	"notice_id" uuid,
	"given_by_user_id" uuid,
	"capacity" text NOT NULL,
	"legal_basis" text NOT NULL,
	"explicit" boolean NOT NULL,
	"written" boolean NOT NULL,
	"method" text NOT NULL,
	"evidence_file_id" uuid,
	"recorded_by_user_id" uuid,
	"valid_during" daterange NOT NULL,
	"subject_age_at_decision" smallint,
	"refresh_due_on" date,
	"note" text,
	CONSTRAINT "consent_records_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "consent_records_decision_check" CHECK (decision in ('granted', 'refused', 'withdrawn')),
	CONSTRAINT "consent_records_capacity_check" CHECK (capacity in ('self', 'guardian', 'school_on_behalf')),
	CONSTRAINT "consent_records_legal_basis_check" CHECK (legal_basis in ('consent', 'contract', 'legal_obligation', 'public_task', 'school_authorization', 'legitimate_interest')),
	CONSTRAINT "consent_records_method_check" CHECK (method in ('electronic', 'electronic_signature', 'paper_scanned', 'verbal_recorded', 'import')),
	CONSTRAINT "consent_records_subject_age_at_decision_check" CHECK (subject_age_at_decision between 0 and 120),
	CONSTRAINT "consent_records_note_check" CHECK (char_length(note) between 1 and 500),
	CONSTRAINT "consent_records_guardian_check" CHECK (capacity <> 'guardian' or given_by_user_id is not null),
	CONSTRAINT "consent_records_self_check" CHECK (capacity <> 'self' or given_by_user_id = subject_user_id),
	CONSTRAINT "consent_records_notice_check" CHECK (method = 'import' or decision = 'withdrawn' or notice_id is not null),
	CONSTRAINT "consent_records_valid_during_check" CHECK (not isempty(valid_during) and not lower_inf(valid_during))
);
--> statement-breakpoint
ALTER TABLE "core"."consent_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "health"."contact_changes" (
	"tenant_id" uuid,
	"change_id" uuid,
	"relationship_id" uuid NOT NULL,
	CONSTRAINT "contact_changes_pkey" PRIMARY KEY("tenant_id","change_id")
);
--> statement-breakpoint
ALTER TABLE "health"."contact_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."contact_points" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text DEFAULT 'other' NOT NULL,
	"value" text NOT NULL,
	"normalized" text,
	"postal" jsonb,
	"sms_capable" boolean,
	"purposes" text[] DEFAULT '{notify}'::text[] NOT NULL,
	"priority" smallint,
	"do_not_publish" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_method" text,
	"bounced_at" timestamp with time zone,
	"complaint_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"source" text NOT NULL,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "contact_points_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "contact_points_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "contact_points_version_check" CHECK (version > 0),
	CONSTRAINT "contact_points_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "contact_points_kind_check" CHECK (kind in ('email', 'phone', 'postal')),
	CONSTRAINT "contact_points_label_check" CHECK (label in ('mobile', 'home', 'work', 'personal', 'emergency', 'other')),
	CONSTRAINT "contact_points_value_check" CHECK (char_length(value) between 1 and 500),
	CONSTRAINT "contact_points_normalized_check" CHECK (char_length(normalized) between 1 and 320),
	CONSTRAINT "contact_points_postal_check" CHECK (jsonb_typeof(postal) = 'object'),
	CONSTRAINT "contact_points_purposes_check" CHECK (purposes <@ '{notify,security,recovery,login}'),
	CONSTRAINT "contact_points_priority_check" CHECK (priority between 1 and 99),
	CONSTRAINT "contact_points_verification_method_check" CHECK (verification_method in ('confirmation_code', 'invitation', 'idp_asserted', 'staff_attested', 'legacy_unverified')),
	CONSTRAINT "contact_points_source_check" CHECK (source in ('manual', 'import', 'self_service', 'sis', 'sso')),
	CONSTRAINT "contact_points_phone_check" CHECK (kind <> 'phone' or normalized is null or normalized ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "contact_points_email_check" CHECK (kind <> 'email' or normalized is null or (normalized = lower(normalized) and strpos(normalized, '@') > 1)),
	CONSTRAINT "contact_points_postal_kind_check" CHECK ((kind = 'postal') = (postal is not null) and (kind <> 'postal' or normalized is null)),
	CONSTRAINT "contact_points_security_check" CHECK (not (purposes && '{security,recovery,login}') or (kind <> 'postal' and verified_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."contact_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."courses" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"code" text NOT NULL,
	"title_en" text,
	"title_ar" text,
	"subject_descriptor_id" uuid NOT NULL,
	"subject_ns" text GENERATED ALWAYS AS ('subject') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "courses_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "courses_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "courses_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "courses_version_check" CHECK (version > 0),
	CONSTRAINT "courses_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "courses_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "courses_code_check" CHECK (code ~ '^[A-Za-z0-9_.-]{1,40}$'),
	CONSTRAINT "courses_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "courses_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "courses_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."demographics" (
	"tenant_id" uuid,
	"user_id" uuid,
	"birth_country_code" text,
	"birth_city" text,
	"nationality_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"religion_descriptor_id" uuid,
	"religion_ns" text GENERATED ALWAYS AS ('religion') STORED NOT NULL,
	"home_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "demographics_pkey" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "demographics_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "demographics_version_check" CHECK (version > 0),
	CONSTRAINT "demographics_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "demographics_birth_country_code_check" CHECK (birth_country_code ~ '^[A-Z]{2}$'),
	CONSTRAINT "demographics_birth_city_check" CHECK (char_length(birth_city) between 1 and 100),
	CONSTRAINT "demographics_nationality_codes_check" CHECK (array_to_string(nationality_codes, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
	CONSTRAINT "demographics_home_languages_check" CHECK (array_to_string(home_languages, ',') ~ '^([a-z]{2,3}(,[a-z]{2,3})*)?$')
);
--> statement-breakpoint
ALTER TABLE "core"."demographics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."descriptor_overrides" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"descriptor_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"label_en" text,
	"label_ar" text,
	"description_en" text,
	"description_ar" text,
	"sort_order" integer,
	"color" text,
	"icon" text,
	"effective_during" daterange,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "descriptor_overrides_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "descriptor_overrides_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "descriptor_overrides_version_check" CHECK (version > 0),
	CONSTRAINT "descriptor_overrides_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "descriptor_overrides_label_en_check" CHECK (char_length(label_en) between 1 and 75),
	CONSTRAINT "descriptor_overrides_label_ar_check" CHECK (char_length(label_ar) between 1 and 75),
	CONSTRAINT "descriptor_overrides_description_en_check" CHECK (char_length(description_en) between 1 and 500),
	CONSTRAINT "descriptor_overrides_description_ar_check" CHECK (char_length(description_ar) between 1 and 500),
	CONSTRAINT "descriptor_overrides_color_check" CHECK (color ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "descriptor_overrides_icon_check" CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "descriptor_overrides_content_check" CHECK (num_nonnulls(label_en, label_ar, description_en, description_ar, sort_order, color, icon, effective_during) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."descriptor_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."descriptors" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"namespace" text NOT NULL,
	"code_value" text NOT NULL,
	"label_en" text,
	"label_ar" text,
	"description_en" text,
	"description_ar" text,
	"system_meaning" text,
	"org_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color" text,
	"icon" text,
	"effective_during" daterange DEFAULT '(,)' NOT NULL,
	"prior_descriptor_id" uuid,
	"oneroster_token" text,
	"edfi_uri" text,
	"seeded" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "descriptors_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "descriptors_tenant_id_id_namespace_key" UNIQUE("tenant_id","id","namespace"),
	CONSTRAINT "descriptors_tenant_id_id_namespace_system_meaning_key" UNIQUE("tenant_id","id","namespace","system_meaning"),
	CONSTRAINT "descriptors_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "descriptors_version_check" CHECK (version > 0),
	CONSTRAINT "descriptors_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "descriptors_namespace_check" CHECK (namespace ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "descriptors_code_value_check" CHECK (char_length(code_value) between 1 and 50 and strpos(code_value, '#') = 0),
	CONSTRAINT "descriptors_label_en_check" CHECK (char_length(label_en) between 1 and 75),
	CONSTRAINT "descriptors_label_ar_check" CHECK (char_length(label_ar) between 1 and 75),
	CONSTRAINT "descriptors_description_en_check" CHECK (char_length(description_en) between 1 and 500),
	CONSTRAINT "descriptors_description_ar_check" CHECK (char_length(description_ar) between 1 and 500),
	CONSTRAINT "descriptors_system_meaning_check" CHECK (system_meaning ~ '^[a-z][a-z0-9_]{0,62}$'),
	CONSTRAINT "descriptors_color_check" CHECK (color ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "descriptors_icon_check" CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "descriptors_oneroster_token_check" CHECK (oneroster_token ~ '^(ext:)?[A-Za-z0-9._-]{1,60}$'),
	CONSTRAINT "descriptors_edfi_uri_check" CHECK (char_length(edfi_uri) between 1 and 306),
	CONSTRAINT "descriptors_label_check" CHECK (num_nonnulls(label_en, label_ar) >= 1),
	CONSTRAINT "descriptors_seeded_meaning_check" CHECK (not seeded or (system_meaning is not null and org_id is null)),
	CONSTRAINT "descriptors_seeded_status_check" CHECK (not (seeded and status = 'tobedeleted')),
	CONSTRAINT "descriptors_relation_token_check" CHECK (namespace <> 'relation' or oneroster_token is not distinct from (case system_meaning when 'mother' then 'parent' when 'father' then 'parent' when 'guardian' then 'guardian' when 'step_parent' then 'relative' when 'grandparent' then 'relative' when 'sibling' then 'relative' when 'other_relative' then 'relative' end))
);
--> statement-breakpoint
ALTER TABLE "core"."descriptors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."devices" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"account_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"app_version" text,
	"push_token_ciphertext" bytea,
	"key_purpose" text GENERATED ALWAYS AS (case when push_token_ciphertext is not null then 'identifiers' end) STORED,
	"key_version" integer,
	"locale" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "devices_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "devices_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "devices_version_check" CHECK (version > 0),
	CONSTRAINT "devices_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "devices_platform_check" CHECK (platform in ('ios', 'android', 'web')),
	CONSTRAINT "devices_app_version_check" CHECK (char_length(app_version) between 1 and 40),
	CONSTRAINT "devices_push_token_ciphertext_check" CHECK (octet_length(push_token_ciphertext) between 30 and 4096),
	CONSTRAINT "devices_locale_check" CHECK (locale in ('ar', 'en')),
	CONSTRAINT "devices_revoked_reason_check" CHECK (revoked_reason in ('sign_out', 'admin', 'token_invalid', 'replaced')),
	CONSTRAINT "devices_key_check" CHECK ((push_token_ciphertext is null) = (key_version is null)),
	CONSTRAINT "devices_revoked_check" CHECK ((revoked_at is null) = (revoked_reason is null))
);
--> statement-breakpoint
ALTER TABLE "core"."devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."discussion_likes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "discussion_likes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "discussion_likes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "discussion_likes_version_check" CHECK (version > 0),
	CONSTRAINT "discussion_likes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."discussion_posts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"parent_post_id" uuid,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"edited_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"redacted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "discussion_posts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "discussion_posts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "discussion_posts_version_check" CHECK (version > 0),
	CONSTRAINT "discussion_posts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "discussion_posts_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 131072),
	CONSTRAINT "discussion_posts_plain_text_check" CHECK (char_length(plain_text) <= 20000),
	CONSTRAINT "discussion_posts_hidden_check" CHECK ((hidden_at is null) = (hidden_by_user_id is null)),
	CONSTRAINT "discussion_posts_redacted_check" CHECK (redacted_at is null or (content = '{}' and plain_text = ''))
);
--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_comments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"edited_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_comments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_comments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_comments_version_check" CHECK (version > 0),
	CONSTRAINT "document_comments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_comments_body_check" CHECK (char_length(body) between 1 and 2000),
	CONSTRAINT "document_comments_mentions_check" CHECK (cardinality(mentioned_user_ids) <= 10)
);
--> statement-breakpoint
ALTER TABLE "core"."document_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_files" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"document_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_purpose" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_files_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_files_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_files_version_check" CHECK (version > 0),
	CONSTRAINT "document_files_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_files_file_purpose_check" CHECK (file_purpose in ('document_media', 'attachment', 'site_media', 'message_attachment'))
);
--> statement-breakpoint
ALTER TABLE "core"."document_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_holds" (
	"tenant_id" uuid,
	"host_type" text,
	"host_id" uuid,
	"user_id" uuid NOT NULL,
	"held_since" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_holds_pkey" PRIMARY KEY("tenant_id","host_type","host_id"),
	CONSTRAINT "document_holds_host_type_check" CHECK (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "document_holds_expires_at_check" CHECK (expires_at >= held_since)
);
--> statement-breakpoint
ALTER TABLE "core"."document_holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_links" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"document_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"href" text,
	"last_checked_at" timestamp with time zone,
	"last_check_status" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_links_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_links_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_links_version_check" CHECK (version > 0),
	CONSTRAINT "document_links_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_links_target_type_check" CHECK (target_type ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "document_links_href_check" CHECK (char_length(href) between 1 and 2048),
	CONSTRAINT "document_links_last_check_status_check" CHECK (last_check_status between 0 and 999),
	CONSTRAINT "document_links_target_check" CHECK ((target_type = 'url') = (target_id is null) and (target_type <> 'url' or href is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."document_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_templates" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"kind" text NOT NULL,
	"builtin_key" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"subject_descriptor_id" uuid,
	"subject_ns" text GENERATED ALWAYS AS ('subject') STORED NOT NULL,
	"state" text DEFAULT 'shared' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_templates_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_templates_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_templates_version_check" CHECK (version > 0),
	CONSTRAINT "document_templates_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_templates_kind_check" CHECK (kind in ('lesson', 'assignment', 'unit_plan', 'announcement', 'event', 'consent_form', 'module', 'message', 'admission_letter', 'section')),
	CONSTRAINT "document_templates_title_check" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "document_templates_description_check" CHECK (char_length(description) <= 500),
	CONSTRAINT "document_templates_state_check" CHECK (state in ('pending', 'shared', 'declined')),
	CONSTRAINT "document_templates_review_note_check" CHECK (review_note is null or char_length(review_note) between 1 and 500),
	CONSTRAINT "document_templates_builtin_check" CHECK ((builtin_key is null) = (owner_user_id is not null)),
	CONSTRAINT "document_templates_builtin_key_check" CHECK (builtin_key ~ '^[a-z][a-z0-9_]{1,62}$')
);
--> statement-breakpoint
ALTER TABLE "core"."document_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_threads" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"document_id" uuid NOT NULL,
	"part" text DEFAULT 'body' NOT NULL,
	"anchor" jsonb NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_threads_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_threads_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_threads_version_check" CHECK (version > 0),
	CONSTRAINT "document_threads_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_threads_part_check" CHECK (part ~ '^[a-z][a-z0-9_-]{0,39}$'),
	CONSTRAINT "document_threads_anchor_check" CHECK (jsonb_typeof(anchor) = 'object'),
	CONSTRAINT "document_threads_quote_check" CHECK (char_length(quote) <= 280),
	CONSTRAINT "document_threads_resolved_check" CHECK ((resolved_at is null) = (resolved_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."document_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_translations" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"document_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"target_locale" text NOT NULL,
	"origin" text NOT NULL,
	"engine" text,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_translations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_translations_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_translations_version_check" CHECK (version > 0),
	CONSTRAINT "document_translations_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_translations_source_version_check" CHECK (source_version > 0),
	CONSTRAINT "document_translations_target_locale_check" CHECK (target_locale in ('ar', 'en')),
	CONSTRAINT "document_translations_origin_check" CHECK (origin in ('machine', 'human')),
	CONSTRAINT "document_translations_engine_check" CHECK (char_length(engine) between 1 and 60),
	CONSTRAINT "document_translations_content_check" CHECK (jsonb_typeof(content) = 'object'),
	CONSTRAINT "document_translations_machine_check" CHECK ((origin = 'machine') = (engine is not null)),
	CONSTRAINT "document_translations_review_check" CHECK ((reviewed_at is null) = (reviewed_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."document_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_versions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"document_id" uuid NOT NULL,
	"document_version" integer NOT NULL,
	"reason" text NOT NULL,
	"label" text,
	"ydoc_snapshot" bytea,
	"content" jsonb NOT NULL,
	"plain_text" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"redacted_at" timestamp with time zone,
	CONSTRAINT "document_versions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_versions_tenant_id_document_id_document_version_re_key" UNIQUE("tenant_id","document_id","document_version","reason"),
	CONSTRAINT "document_versions_document_version_check" CHECK (document_version > 0),
	CONSTRAINT "document_versions_reason_check" CHECK (reason in ('publish', 'checkpoint', 'before_restore', 'import')),
	CONSTRAINT "document_versions_label_check" CHECK (char_length(label) between 1 and 120),
	CONSTRAINT "document_versions_ydoc_snapshot_check" CHECK (octet_length(ydoc_snapshot) <= 8388608),
	CONSTRAINT "document_versions_content_check" CHECK (jsonb_typeof(content) = 'object'),
	CONSTRAINT "document_versions_redacted_check" CHECK (redacted_at is null or (content = '{}' and plain_text = '' and ydoc_snapshot is null))
);
--> statement-breakpoint
ALTER TABLE "core"."document_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."documents" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"host_type" text NOT NULL,
	"host_id" uuid NOT NULL,
	"org_id" uuid,
	"kind" text NOT NULL,
	"schema_version" smallint NOT NULL,
	"locale" text,
	"translation_of_id" uuid,
	"collaborative" boolean DEFAULT false NOT NULL,
	"ydoc" bytea,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"frozen_at" timestamp with time zone,
	"last_edited_by_user_id" uuid,
	"last_edited_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "documents_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "documents_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "documents_version_check" CHECK (version > 0),
	CONSTRAINT "documents_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "documents_host_type_check" CHECK (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "documents_kind_check" CHECK (kind in ('rich_text', 'page', 'lesson', 'transcript', 'section')),
	CONSTRAINT "documents_schema_version_check" CHECK (schema_version > 0),
	CONSTRAINT "documents_locale_check" CHECK (locale in ('ar', 'en')),
	CONSTRAINT "documents_ydoc_check" CHECK (octet_length(ydoc) <= 8388608),
	CONSTRAINT "documents_content_check" CHECK (jsonb_typeof(content) = 'object'),
	CONSTRAINT "documents_collab_check" CHECK (collaborative or ydoc is null),
	CONSTRAINT "documents_frozen_check" CHECK (frozen_at is null or not collaborative),
	CONSTRAINT "documents_translation_check" CHECK (translation_of_id is null or locale is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."emergency_contacts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"phone" text NOT NULL,
	"other_phone" text,
	"email" text,
	"call_order" smallint NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "emergency_contacts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "emergency_contacts_version_check" CHECK (version > 0),
	CONSTRAINT "emergency_contacts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "emergency_contacts_name_check" CHECK (char_length(name) between 1 and 160),
	CONSTRAINT "emergency_contacts_relationship_check" CHECK (char_length(relationship) between 1 and 80),
	CONSTRAINT "emergency_contacts_phone_check" CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "emergency_contacts_other_phone_check" CHECK (other_phone ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "emergency_contacts_email_check" CHECK (char_length(email) between 3 and 254 and email = lower(email) and strpos(email, '@') > 1),
	CONSTRAINT "emergency_contacts_call_order_check" CHECK (call_order between 1 and 99),
	CONSTRAINT "emergency_contacts_notes_check" CHECK (char_length(notes) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."emergency_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."enrollments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"class_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"classroom_position_descriptor_id" uuid,
	"classroom_position_ns" text GENERATED ALWAYS AS ('classroom_position') STORED NOT NULL,
	"valid_during" daterange NOT NULL,
	"source" text NOT NULL,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"active_class_id" uuid GENERATED ALWAYS AS (case when status = 'active' then class_id end) STORED,
	CONSTRAINT "enrollments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "enrollments_tenant_id_id_class_id_user_id_org_id_valid_duri_key" UNIQUE("tenant_id","id","class_id","user_id","org_id","valid_during","status"),
	CONSTRAINT "enrollments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "enrollments_version_check" CHECK (version > 0),
	CONSTRAINT "enrollments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "enrollments_role_check" CHECK (role in ('student', 'teacher', 'aide', 'proctor', 'administrator')),
	CONSTRAINT "enrollments_primary_check" CHECK (not is_primary or role = 'teacher'),
	CONSTRAINT "enrollments_position_check" CHECK (classroom_position_descriptor_id is null or role in ('teacher', 'aide')),
	CONSTRAINT "enrollments_source_check" CHECK (source in ('manual', 'import', 'sis', 'oneroster', 'rollover', 'homeroom')),
	CONSTRAINT "enrollments_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."erasure_approvals" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"subject_user_id" uuid,
	"subject_contact_id" uuid,
	"basis" text NOT NULL,
	"request_reference" text,
	"approved_by_user_id" uuid NOT NULL,
	"second_approver_user_id" uuid,
	CONSTRAINT "erasure_approvals_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "erasure_approvals_basis_check" CHECK (basis in ('data_subject_request', 'retention_schedule', 'regulator_order')),
	CONSTRAINT "erasure_approvals_request_reference_check" CHECK (char_length(request_reference) between 1 and 120),
	CONSTRAINT "erasure_approvals_approvers_check" CHECK (second_approver_user_id is distinct from approved_by_user_id),
	CONSTRAINT "erasure_approvals_subject_check" CHECK (num_nonnulls(subject_user_id, subject_contact_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."erasure_items" (
	"tenant_id" uuid,
	"approval_id" uuid,
	"object_type" text,
	"object_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "erasure_items_pkey" PRIMARY KEY("tenant_id","approval_id","object_type","object_id"),
	CONSTRAINT "erasure_items_object_type_check" CHECK (object_type in ('file', 'document', 'message_thread', 'site_enquiry'))
);
--> statement-breakpoint
ALTER TABLE "core"."erasure_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."external_ids" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"system_descriptor_id" uuid NOT NULL,
	"system_ns" text GENERATED ALWAYS AS ('external_id_system') STORED NOT NULL,
	"system_meaning" text NOT NULL,
	"identifier" text,
	"identifier_ciphertext" bytea,
	"identifier_hmac" bytea,
	"identifier_last4" text,
	"key_purpose" text GENERATED ALWAYS AS (case when identifier_ciphertext is not null then 'identifiers' end) STORED,
	"key_version" integer,
	"assigning_org_id" uuid,
	"issuing_country_code" text,
	"valid_during" daterange NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "external_ids_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "external_ids_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "external_ids_version_check" CHECK (version > 0),
	CONSTRAINT "external_ids_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "external_ids_identifier_check" CHECK (char_length(identifier) between 1 and 64),
	CONSTRAINT "external_ids_identifier_ciphertext_check" CHECK (octet_length(identifier_ciphertext) between 30 and 512),
	CONSTRAINT "external_ids_identifier_hmac_check" CHECK (octet_length(identifier_hmac) = 32),
	CONSTRAINT "external_ids_identifier_last4_check" CHECK (char_length(identifier_last4) between 1 and 4),
	CONSTRAINT "external_ids_value_check" CHECK (num_nonnulls(identifier, identifier_ciphertext) = 1),
	CONSTRAINT "external_ids_sealed_check" CHECK ((identifier_ciphertext is null) = (identifier_hmac is null) and (identifier_ciphertext is null) = (key_version is null)),
	CONSTRAINT "external_ids_sensitive_check" CHECK (system_meaning not in ('national_id', 'passport', 'residence_permit', 'birth_certificate') or identifier_ciphertext is not null),
	CONSTRAINT "external_ids_issuing_country_code_check" CHECK (issuing_country_code ~ '^[A-Z]{2}$'),
	CONSTRAINT "external_ids_suffix_check" CHECK (system_meaning <> 'national_id' or identifier_last4 is null),
	CONSTRAINT "external_ids_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."external_ids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "core"."federated_identities" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"login_identity_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"issuer_tenant" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "federated_identities_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "federated_identities_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "federated_identities_version_check" CHECK (version > 0),
	CONSTRAINT "federated_identities_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "federated_identities_subject_check" CHECK (char_length(subject) between 1 and 256),
	CONSTRAINT "federated_identities_issuer_tenant_check" CHECK (char_length(issuer_tenant) between 1 and 256)
);
--> statement-breakpoint
ALTER TABLE "core"."federated_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."file_previews" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"storage_key" text NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"leased_until" timestamp with time zone,
	"progress" real,
	"error" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"placeholder" text,
	"sizes" jsonb DEFAULT '[]' NOT NULL,
	"waveform" jsonb,
	"pages" integer,
	"document_bytes" bigint,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "file_previews_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "file_previews_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "file_previews_version_check" CHECK (version > 0),
	CONSTRAINT "file_previews_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "file_previews_storage_key_check" CHECK (starts_with(storage_key, 't/' || tenant_id::text || '/f/') and char_length(storage_key) <= 512),
	CONSTRAINT "file_previews_kind_check" CHECK (kind in ('picture', 'audio', 'pdf', 'office')),
	CONSTRAINT "file_previews_media_type_check" CHECK (char_length(media_type) between 3 and 128),
	CONSTRAINT "file_previews_state_check" CHECK (state in ('queued', 'working', 'ready', 'failed')),
	CONSTRAINT "file_previews_attempts_check" CHECK (attempts between 0 and 10),
	CONSTRAINT "file_previews_progress_check" CHECK (progress between 0 and 1),
	CONSTRAINT "file_previews_error_check" CHECK (char_length(error) <= 2000),
	CONSTRAINT "file_previews_lease_check" CHECK ((state = 'working') = (leased_until is not null)),
	CONSTRAINT "file_previews_width_check" CHECK (width between 1 and 100000),
	CONSTRAINT "file_previews_height_check" CHECK (height between 1 and 100000),
	CONSTRAINT "file_previews_duration_ms_check" CHECK (duration_ms > 0),
	CONSTRAINT "file_previews_placeholder_check" CHECK (placeholder ~ '^[A-Za-z0-9+/]{4,80}={0,2}$'),
	CONSTRAINT "file_previews_sizes_check" CHECK (jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) <= 20),
	CONSTRAINT "file_previews_waveform_check" CHECK (jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) <= 400),
	CONSTRAINT "file_previews_pages_check" CHECK (pages > 0),
	CONSTRAINT "file_previews_document_bytes_check" CHECK (document_bytes > 0),
	CONSTRAINT "file_previews_bytes_check" CHECK (bytes >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."file_previews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."file_publications" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"file_purpose" text NOT NULL,
	"derivative" text,
	"public_key" text NOT NULL,
	"host_type" text NOT NULL,
	"host_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"unpublished_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "file_publications_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "file_publications_tenant_id_public_key_key" UNIQUE("tenant_id","public_key"),
	CONSTRAINT "file_publications_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "file_publications_version_check" CHECK (version > 0),
	CONSTRAINT "file_publications_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "file_publications_file_purpose_check" CHECK (file_purpose in ('site_media', 'logo', 'document_media')),
	CONSTRAINT "file_publications_derivative_check" CHECK (derivative ~ '^[a-z0-9_]{1,40}$'),
	CONSTRAINT "file_publications_public_key_check" CHECK (public_key ~ '^p/[a-z0-9]{26}/[A-Za-z0-9._-]{1,120}$'),
	CONSTRAINT "file_publications_host_type_check" CHECK (host_type ~ '^[a-z][a-z0-9_]{1,62}$')
);
--> statement-breakpoint
ALTER TABLE "core"."file_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."file_subjects" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tagged_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "file_subjects_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "file_subjects_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "file_subjects_version_check" CHECK (version > 0),
	CONSTRAINT "file_subjects_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."files" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"uploaded_by_user_id" uuid,
	"host_type" text,
	"host_id" uuid,
	"org_id" uuid,
	"purpose" text NOT NULL,
	"name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" bytea,
	"state" text DEFAULT 'initiated' NOT NULL,
	"rejection_reason" text,
	"storage_key" text NOT NULL,
	"encryption" text DEFAULT 'bucket' NOT NULL,
	"key_purpose" text GENERATED ALWAYS AS (case when encryption = 'tenant_dek' then 'files' end) STORED,
	"key_version" integer,
	"scanned_at" timestamp with time zone,
	"scan_engine" text,
	"ready_at" timestamp with time zone,
	"linked_at" timestamp with time zone,
	"trashed_at" timestamp with time zone,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"derivatives" jsonb DEFAULT '{}' NOT NULL,
	"stream_state" text,
	"stream_attempts" integer DEFAULT 0 NOT NULL,
	"stream_leased_until" timestamp with time zone,
	"stream_progress" real,
	"stream_error" text,
	"stream_bytes" bigint,
	"folder_id" uuid,
	"description" text,
	"credit" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "files_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "files_tenant_id_id_purpose_key" UNIQUE("tenant_id","id","purpose"),
	CONSTRAINT "files_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "files_version_check" CHECK (version > 0),
	CONSTRAINT "files_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "files_host_type_check" CHECK (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "files_purpose_check" CHECK (purpose in ('document_media', 'attachment', 'submission', 'avatar', 'logo', 'site_media', 'health_report', 'legal_document', 'evidence', 'import_source', 'export', 'admission_document', 'message_attachment')),
	CONSTRAINT "files_name_check" CHECK (char_length(name) between 1 and 255),
	CONSTRAINT "files_media_type_check" CHECK (char_length(media_type) between 3 and 128),
	CONSTRAINT "files_size_bytes_check" CHECK (size_bytes > 0),
	CONSTRAINT "files_sha256_check" CHECK (octet_length(sha256) = 32),
	CONSTRAINT "files_state_check" CHECK (state in ('initiated', 'quarantined', 'ready', 'rejected')),
	CONSTRAINT "files_rejection_reason_check" CHECK (rejection_reason in ('too_large', 'size_mismatch', 'content_mismatch', 'infected', 'scan_unavailable', 'abandoned')),
	CONSTRAINT "files_storage_key_check" CHECK (char_length(storage_key) between 1 and 512),
	CONSTRAINT "files_encryption_check" CHECK (encryption in ('bucket', 'tenant_dek')),
	CONSTRAINT "files_scan_engine_check" CHECK (char_length(scan_engine) between 1 and 60),
	CONSTRAINT "files_width_check" CHECK (width > 0),
	CONSTRAINT "files_height_check" CHECK (height > 0),
	CONSTRAINT "files_duration_ms_check" CHECK (duration_ms > 0),
	CONSTRAINT "files_derivatives_check" CHECK (jsonb_typeof(derivatives) = 'object'),
	CONSTRAINT "files_stream_state_check" CHECK (stream_state in ('queued', 'encoding', 'ready', 'failed')),
	CONSTRAINT "files_stream_attempts_check" CHECK (stream_attempts between 0 and 10),
	CONSTRAINT "files_stream_progress_check" CHECK (stream_progress between 0 and 1),
	CONSTRAINT "files_stream_error_check" CHECK (char_length(stream_error) <= 2000),
	CONSTRAINT "files_stream_bytes_check" CHECK (stream_bytes >= 0),
	CONSTRAINT "files_stream_lease_check" CHECK ((stream_state = 'encoding') = (stream_leased_until is not null)),
	CONSTRAINT "files_host_pair_check" CHECK ((host_type is null) = (host_id is null)),
	CONSTRAINT "files_folder_id_check" CHECK (folder_id is null or host_type = 'media_library'),
	CONSTRAINT "files_description_check" CHECK (char_length(description) <= 300),
	CONSTRAINT "files_credit_check" CHECK (jsonb_typeof(credit) = 'object'),
	CONSTRAINT "files_rejection_check" CHECK ((state = 'rejected') = (rejection_reason is not null)),
	CONSTRAINT "files_ready_check" CHECK (state <> 'ready' or (sha256 is not null and ready_at is not null)),
	CONSTRAINT "files_key_check" CHECK ((encryption = 'tenant_dek') = (key_version is not null)),
	CONSTRAINT "files_storage_prefix_check" CHECK (starts_with(storage_key, 't/' || tenant_id::text || '/')),
	CONSTRAINT "files_derivatives_prefix_check" CHECK (not jsonb_path_exists(derivatives, '$.*.key ? (!(@ starts with $p))', jsonb_build_object('p', 't/' || tenant_id::text || '/'))),
	CONSTRAINT "files_health_report_check" CHECK (purpose <> 'health_report' or (derivatives = '{}' and name ~ '^medical-report(\.[a-z0-9]{1,8})?$' and (state <> 'ready' or encryption = 'tenant_dek'))),
	CONSTRAINT "files_sealed_check" CHECK (purpose not in ('health_report', 'evidence', 'legal_document') or (stream_state is null and derivatives = '{}' and (state <> 'ready' or encryption = 'tenant_dek'))),
	CONSTRAINT "files_sealed_prefix_check" CHECK (encryption <> 'tenant_dek' or starts_with(storage_key, 't/' || tenant_id::text || '/h/'))
);
--> statement-breakpoint
ALTER TABLE "core"."files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."goal_judgements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"level" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sitting_id" uuid,
	"block_id" uuid,
	"judged_by_user_id" uuid NOT NULL,
	"judged_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "goal_judgements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "goal_judgements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "goal_judgements_version_check" CHECK (version > 0),
	CONSTRAINT "goal_judgements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "goal_judgements_level_check" CHECK (level in ('emerging', 'expected', 'exempt')),
	CONSTRAINT "goal_judgements_note_check" CHECK (char_length(note) <= 1000),
	CONSTRAINT "goal_judgements_work_check" CHECK ((sitting_id is null) = (block_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."goal_reports" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"shared_by_user_id" uuid NOT NULL,
	"shared_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "goal_reports_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "goal_reports_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "goal_reports_version_check" CHECK (version > 0),
	CONSTRAINT "goal_reports_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."grade_level_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"term" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "grade_level_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "grade_level_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "grade_level_settings_version_check" CHECK (version > 0),
	CONSTRAINT "grade_level_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "grade_level_settings_term_check" CHECK (term in ('grade', 'level', 'year_group', 'stage'))
);
--> statement-breakpoint
ALTER TABLE "core"."grade_level_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."grade_scale_versions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"scale_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"bands" jsonb NOT NULL,
	"reason" text,
	"created_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "grade_scale_versions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "grade_scale_versions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "grade_scale_versions_version_check" CHECK (version > 0),
	CONSTRAINT "grade_scale_versions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "grade_scale_versions_bands_check" CHECK (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 2 and 20),
	CONSTRAINT "grade_scale_versions_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."grade_scales" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"display" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "grade_scales_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "grade_scales_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "grade_scales_version_check" CHECK (version > 0),
	CONSTRAINT "grade_scales_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "grade_scales_display_check" CHECK (display in ('grade', 'grade_score')),
	CONSTRAINT "grade_scales_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "grade_scales_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "grade_scales_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."grade_scales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."gradebook_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"running_shown" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "gradebook_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "gradebook_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "gradebook_settings_version_check" CHECK (version > 0),
	CONSTRAINT "gradebook_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."gradebook_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "health"."requested_changes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"request_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"target" text NOT NULL,
	"kind_descriptor_id" uuid,
	"kind_ns" text GENERATED ALWAYS AS ('health_record_kind') STORED NOT NULL,
	"record_id" uuid,
	"key_purpose" text GENERATED ALWAYS AS ('health') STORED NOT NULL,
	"key_version" integer NOT NULL,
	"ciphertext" bytea NOT NULL,
	"file_id" uuid,
	"file_purpose" text DEFAULT 'health_report' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "requested_changes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "requested_changes_tenant_id_request_id_key" UNIQUE("tenant_id","request_id"),
	CONSTRAINT "requested_changes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "requested_changes_version_check" CHECK (version > 0),
	CONSTRAINT "requested_changes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "requested_changes_file_purpose_check" CHECK (file_purpose = 'health_report'),
	CONSTRAINT "requested_changes_file_target_check" CHECK (file_id is null or target = 'record'),
	CONSTRAINT "requested_changes_target_check" CHECK (target in ('record', 'contact')),
	CONSTRAINT "requested_changes_shape_check" CHECK ((target = 'record') = (kind_descriptor_id is not null) and (record_id is null or target = 'record')),
	CONSTRAINT "requested_changes_ciphertext_check" CHECK (octet_length(ciphertext) between 29 and 65565),
	CONSTRAINT "requested_changes_metadata_empty_check" CHECK (metadata = '{}')
);
--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "health"."records" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"kind_descriptor_id" uuid NOT NULL,
	"kind_ns" text GENERATED ALWAYS AS ('health_record_kind') STORED NOT NULL,
	"has_alert" boolean DEFAULT false NOT NULL,
	"recorded_on" date,
	"key_purpose" text GENERATED ALWAYS AS ('health') STORED NOT NULL,
	"key_version" integer NOT NULL,
	"ciphertext" bytea NOT NULL,
	"file_id" uuid,
	"file_purpose" text DEFAULT 'health_report' NOT NULL,
	"report_shared" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "records_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "records_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "records_version_check" CHECK (version > 0),
	CONSTRAINT "records_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "records_ciphertext_check" CHECK (octet_length(ciphertext) between 29 and 65565),
	CONSTRAINT "records_file_purpose_check" CHECK (file_purpose = 'health_report'),
	CONSTRAINT "records_report_shared_check" CHECK (file_id is not null or not report_shared),
	CONSTRAINT "records_metadata_empty_check" CHECK (metadata = '{}')
);
--> statement-breakpoint
ALTER TABLE "health"."records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."homeroom_classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"homeroom_class_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"linked_on" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "homeroom_classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "homeroom_classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "homeroom_classes_version_check" CHECK (version > 0),
	CONSTRAINT "homeroom_classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "homeroom_classes_class_id_check" CHECK (class_id <> homeroom_class_id)
);
--> statement-breakpoint
ALTER TABLE "core"."homeroom_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."homeroom_members" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"homeroom_class_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"valid_during" daterange NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "homeroom_members_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "homeroom_members_tenant_id_enrollment_id_key" UNIQUE("tenant_id","enrollment_id"),
	CONSTRAINT "homeroom_members_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "homeroom_members_version_check" CHECK (version > 0),
	CONSTRAINT "homeroom_members_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "homeroom_members_source_check" CHECK (source in ('manual', 'rollover')),
	CONSTRAINT "homeroom_members_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."homeroom_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."homerooms" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "homerooms_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "homerooms_tenant_id_class_id_key" UNIQUE("tenant_id","class_id"),
	CONSTRAINT "homerooms_tenant_id_class_id_org_id_key" UNIQUE("tenant_id","class_id","org_id"),
	CONSTRAINT "homerooms_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "homerooms_version_check" CHECK (version > 0),
	CONSTRAINT "homerooms_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."homerooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."identity_provider_orgs" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"identity_provider_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "identity_provider_orgs_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "identity_provider_orgs_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "identity_provider_orgs_version_check" CHECK (version > 0),
	CONSTRAINT "identity_provider_orgs_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."identity_provider_orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."identity_providers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"protocol" text NOT NULL,
	"display_name_en" text,
	"display_name_ar" text,
	"issuer" text NOT NULL,
	"client_id" text,
	"metadata_url" text,
	"allowed_issuer_tenants" text[] DEFAULT '{}'::text[] NOT NULL,
	"link_policy" text DEFAULT 'roster_external_id' NOT NULL,
	"provision_policy" text DEFAULT 'none' NOT NULL,
	"attribute_mapping" jsonb DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "identity_providers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "identity_providers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "identity_providers_version_check" CHECK (version > 0),
	CONSTRAINT "identity_providers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "identity_providers_protocol_check" CHECK (protocol in ('oidc', 'saml', 'clever', 'classlink')),
	CONSTRAINT "identity_providers_display_name_en_check" CHECK (char_length(display_name_en) between 1 and 80),
	CONSTRAINT "identity_providers_display_name_ar_check" CHECK (char_length(display_name_ar) between 1 and 80),
	CONSTRAINT "identity_providers_issuer_check" CHECK (char_length(issuer) between 1 and 512),
	CONSTRAINT "identity_providers_client_id_check" CHECK (char_length(client_id) between 1 and 512),
	CONSTRAINT "identity_providers_metadata_url_check" CHECK (char_length(metadata_url) between 1 and 2048),
	CONSTRAINT "identity_providers_link_policy_check" CHECK (link_policy in ('roster_external_id', 'verified_domain_email', 'invitation_only', 'admin_approval')),
	CONSTRAINT "identity_providers_provision_policy_check" CHECK (provision_policy in ('none', 'jit_membership')),
	CONSTRAINT "identity_providers_attribute_mapping_check" CHECK (jsonb_typeof(attribute_mapping) = 'object'),
	CONSTRAINT "identity_providers_name_check" CHECK (num_nonnulls(display_name_en, display_name_ar) >= 1),
	CONSTRAINT "identity_providers_tenant_list_check" CHECK (protocol not in ('oidc', 'clever', 'classlink') or cardinality(allowed_issuer_tenants) >= 1 or link_policy in ('invitation_only', 'admin_approval'))
);
--> statement-breakpoint
ALTER TABLE "core"."identity_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."import_rows" (
	"tenant_id" uuid,
	"import_run_id" uuid,
	"row_number" integer,
	"outcome" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"error_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "import_rows_pkey" PRIMARY KEY("tenant_id","import_run_id","row_number"),
	CONSTRAINT "import_rows_row_number_check" CHECK (row_number > 0),
	CONSTRAINT "import_rows_outcome_check" CHECK (outcome in ('created', 'updated', 'skipped', 'error')),
	CONSTRAINT "import_rows_target_type_check" CHECK (target_type ~ '^[a-z][a-z0-9_]{1,62}$')
);
--> statement-breakpoint
ALTER TABLE "core"."import_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."import_runs" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"source_file_id" uuid NOT NULL,
	"source_file_purpose" text DEFAULT 'import_source' NOT NULL,
	"mapping" jsonb DEFAULT '{}' NOT NULL,
	"state" text DEFAULT 'uploaded' NOT NULL,
	"row_count" integer,
	"created_count" integer,
	"updated_count" integer,
	"skipped_count" integer,
	"error_count" integer,
	"started_by_user_id" uuid NOT NULL,
	"committed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "import_runs_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "import_runs_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "import_runs_version_check" CHECK (version > 0),
	CONSTRAINT "import_runs_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "import_runs_kind_check" CHECK (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
	CONSTRAINT "import_runs_mode_check" CHECK (mode in ('create', 'create_or_update')),
	CONSTRAINT "import_runs_source_file_purpose_check" CHECK (source_file_purpose = 'import_source'),
	CONSTRAINT "import_runs_mapping_check" CHECK (jsonb_typeof(mapping) = 'object' and octet_length(mapping::text) <= 16384),
	CONSTRAINT "import_runs_state_check" CHECK (state in ('uploaded', 'validated', 'committing', 'committed', 'failed', 'cancelled', 'undone')),
	CONSTRAINT "import_runs_row_count_check" CHECK (row_count >= 0),
	CONSTRAINT "import_runs_created_count_check" CHECK (created_count >= 0),
	CONSTRAINT "import_runs_updated_count_check" CHECK (updated_count >= 0),
	CONSTRAINT "import_runs_skipped_count_check" CHECK (skipped_count >= 0),
	CONSTRAINT "import_runs_error_count_check" CHECK (error_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."import_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."intake_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"intake_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "intake_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "intake_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "intake_grades_version_check" CHECK (version > 0),
	CONSTRAINT "intake_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."intake_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."intake_years" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "intake_years_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "intake_years_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "intake_years_version_check" CHECK (version > 0),
	CONSTRAINT "intake_years_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "intake_years_school_year_type_check" CHECK (school_year_type = 'school_year')
);
--> statement-breakpoint
ALTER TABLE "core"."intake_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."learning_modules" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"sequential" boolean DEFAULT true NOT NULL,
	"prerequisite_module_id" uuid,
	"prerequisite_score" smallint,
	"practice_bands" jsonb DEFAULT '[]' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "learning_modules_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "learning_modules_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "learning_modules_version_check" CHECK (version > 0),
	CONSTRAINT "learning_modules_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "learning_modules_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "learning_modules_summary_check" CHECK (char_length(summary) <= 1000),
	CONSTRAINT "learning_modules_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "learning_modules_publish_at_check" CHECK ((state = 'draft') = (publish_at is null)),
	CONSTRAINT "learning_modules_prerequisite_check" CHECK (prerequisite_module_id is null or prerequisite_module_id <> id),
	CONSTRAINT "learning_modules_prerequisite_score_check" CHECK (prerequisite_score is null or (prerequisite_module_id is not null and prerequisite_score between 1 and 100)),
	CONSTRAINT "learning_modules_practice_bands_check" CHECK (jsonb_typeof(practice_bands) = 'array' and jsonb_array_length(practice_bands) <= 6)
);
--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."legal_holds" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"subject_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"placed_by_user_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"released_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "legal_holds_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "legal_holds_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "legal_holds_version_check" CHECK (version > 0),
	CONSTRAINT "legal_holds_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "legal_holds_reason_check" CHECK (char_length(reason) between 1 and 500),
	CONSTRAINT "legal_holds_release_check" CHECK ((released_at is null) = (released_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_changes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"class_period_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"cover_user_id" uuid,
	"location_id" uuid,
	"cancelled" boolean DEFAULT false NOT NULL,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_changes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_changes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_changes_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_changes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_changes_shape_check" CHECK ((cancelled and cover_user_id is null and location_id is null)
        or (not cancelled and (cover_user_id is not null or location_id is not null))),
	CONSTRAINT "lesson_changes_note_check" CHECK (char_length(note) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_code" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" text NOT NULL,
	"code" text NOT NULL,
	"based_on" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_code_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_code_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_code_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_code_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_code_block_check" CHECK (block_id ~ '^[0-9a-z]{8,36}$'),
	CONSTRAINT "lesson_code_code_check" CHECK (char_length(code) <= 20000),
	CONSTRAINT "lesson_code_based_on_check" CHECK (based_on ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_openings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_openings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_openings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_openings_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_openings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_openings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_progress" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"score" smallint,
	"best_score" smallint,
	"attempts" smallint DEFAULT 1 NOT NULL,
	"position" text,
	"results_at" timestamp with time zone,
	"reading" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_progress_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_progress_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_progress_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_progress_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_progress_completed_check" CHECK ((completed_at is null) = (completed_by is null)),
	CONSTRAINT "lesson_progress_completed_by_check" CHECK (completed_by is null or completed_by in ('student', 'teacher')),
	CONSTRAINT "lesson_progress_score_check" CHECK (score is null or score between 0 and 100),
	CONSTRAINT "lesson_progress_reading_check" CHECK (reading in ('en', 'ar')),
	CONSTRAINT "lesson_progress_best_score_check" CHECK (best_score is null or best_score between 0 and 100),
	CONSTRAINT "lesson_progress_attempts_check" CHECK (attempts between 1 and 1000),
	CONSTRAINT "lesson_progress_position_check" CHECK (position is null or char_length(position) <= 64)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_projects" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"files" jsonb NOT NULL,
	"based_on" text NOT NULL,
	"remixed_from_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_projects_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_projects_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_projects_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_projects_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_projects_files_check" CHECK (jsonb_typeof(files) = 'array' and octet_length(files::text) <= 65536),
	CONSTRAINT "lesson_projects_based_on_check" CHECK (based_on ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_releases" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_user_id" uuid,
	"released_by_user_id" uuid NOT NULL,
	"released_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_releases_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_releases_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_releases_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_releases_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_responses" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"document_version_id" uuid,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"try" smallint NOT NULL,
	"kind" text NOT NULL,
	"response" jsonb NOT NULL,
	"fraction" numeric(5,4),
	"state" text NOT NULL,
	"feedback" text,
	"marked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"redacted_at" timestamp with time zone,
	CONSTRAINT "lesson_responses_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_responses_attempt_check" CHECK (attempt between 1 and 1000),
	CONSTRAINT "lesson_responses_try_check" CHECK (try between 1 and 1000),
	CONSTRAINT "lesson_responses_kind_check" CHECK (kind in ('choice', 'poll', 'text', 'math', 'gaps', 'highlight', 'number', 'matching', 'ordering', 'sorting', 'counting', 'tracing', 'spelling', 'hotspot', 'labelling', 'crossword', 'wordsearch', 'written', 'scratch', 'parsons', 'program', 'project', 'puzzle')),
	CONSTRAINT "lesson_responses_response_check" CHECK (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
	CONSTRAINT "lesson_responses_fraction_check" CHECK (fraction is null or fraction between 0 and 1),
	CONSTRAINT "lesson_responses_state_check" CHECK (state in ('answered', 'revealed', 'needs_marking', 'marked', 'reviewed', 'hint', 'remarked')),
	CONSTRAINT "lesson_responses_marked_check" CHECK ((state = 'marked') = (marked_by_user_id is not null) and (state <> 'needs_marking' or fraction is null)),
	CONSTRAINT "lesson_responses_feedback_check" CHECK (feedback is null or char_length(feedback) between 1 and 2000),
	CONSTRAINT "lesson_responses_redacted_check" CHECK (redacted_at is null or (response = '{}' and feedback is null))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_runs" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"code" text NOT NULL,
	"input" text DEFAULT '' NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"output" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_runs_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_runs_attempt_check" CHECK (attempt between 1 and 1000),
	CONSTRAINT "lesson_runs_code_check" CHECK (char_length(code) <= 20000),
	CONSTRAINT "lesson_runs_input_check" CHECK (char_length(input) <= 4000),
	CONSTRAINT "lesson_runs_output_check" CHECK (char_length(output) <= 2000),
	CONSTRAINT "lesson_runs_error_check" CHECK (error is null or char_length(error) between 1 and 500),
	CONSTRAINT "lesson_runs_outcome_check" CHECK (outcome in ('done', 'error', 'timeout', 'output', 'stopped'))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_shares" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"state" text DEFAULT 'offered' NOT NULL,
	"decided_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_shares_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_shares_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_shares_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_shares_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_shares_response_check" CHECK (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
	CONSTRAINT "lesson_shares_state_check" CHECK (state in ('offered', 'shown', 'declined') and (state = 'offered') = (decided_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_sittings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"sitting_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"kind" text GENERATED ALWAYS AS ('lesson') STORED NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_sittings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_sittings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_sittings_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_sittings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_sittings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lesson_watches" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"file_id" uuid,
	"embed" text,
	"video" text GENERATED ALWAYS AS (coalesce(file_id::text, embed)) STORED NOT NULL,
	"watched" int4multirange DEFAULT '{}' NOT NULL,
	"replayed" int4multirange DEFAULT '{}' NOT NULL,
	"duration_seconds" integer NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_watches_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_watches_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lesson_watches_version_check" CHECK (version > 0),
	CONSTRAINT "lesson_watches_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lesson_watches_video_check" CHECK ((file_id is null) <> (embed is null) and (embed is null or embed ~ '^(youtube:[A-Za-z0-9_-]{11}|vimeo:[0-9]{4,12})$')),
	CONSTRAINT "lesson_watches_duration_check" CHECK (duration_seconds between 1 and 21600),
	CONSTRAINT "lesson_watches_position_check" CHECK (position_seconds between 0 and duration_seconds),
	CONSTRAINT "lesson_watches_watched_check" CHECK (watched <@ int4multirange(int4range(0, duration_seconds)))
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."lessons" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"module_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"completion" text DEFAULT 'view' NOT NULL,
	"pass_score" smallint,
	"review" boolean DEFAULT false NOT NULL,
	"feedback_bands" jsonb DEFAULT '[]' NOT NULL,
	"young" boolean DEFAULT false NOT NULL,
	"read_along" boolean DEFAULT true NOT NULL,
	"vowel_marks" text DEFAULT 'shown' NOT NULL,
	"language" text,
	"translation_title" text,
	"translation_reviewed_at" timestamp with time zone,
	"translation_reviewed_by_user_id" uuid,
	"translation_source_digest" text,
	"condition_lesson_id" uuid,
	"condition_at_least" smallint,
	"condition_below" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lessons_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lessons_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "lessons_version_check" CHECK (version > 0),
	CONSTRAINT "lessons_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "lessons_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "lessons_position_check" CHECK (position between 0 and 999),
	CONSTRAINT "lessons_vowel_marks_check" CHECK (vowel_marks in ('shown', 'hidden', 'choice')),
	CONSTRAINT "lessons_language_check" CHECK (language in ('en', 'ar')),
	CONSTRAINT "lessons_translation_title_check" CHECK (translation_title is null or (language is not null and char_length(translation_title) between 1 and 200)),
	CONSTRAINT "lessons_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)),
	CONSTRAINT "lessons_completion_check" CHECK (completion in ('view', 'mark', 'quiz', 'score', 'reflection', 'watch')),
	CONSTRAINT "lessons_pass_score_check" CHECK ((completion = 'score') = (pass_score is not null) and (pass_score is null or pass_score between 1 and 100)),
	CONSTRAINT "lessons_condition_check" CHECK (case when condition_lesson_id is null
        then condition_at_least is null and condition_below is null
        else condition_lesson_id <> id
          and (condition_at_least is not null or condition_below is not null)
          and coalesce(condition_at_least between 1 and 100, true)
          and coalesce(condition_below between 1 and 100, true)
          and coalesce(condition_at_least < condition_below, true) end),
	CONSTRAINT "lessons_feedback_bands_check" CHECK (jsonb_typeof(feedback_bands) = 'array' and jsonb_array_length(feedback_bands) <= 6)
);
--> statement-breakpoint
ALTER TABLE "core"."lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."locations" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"parent_location_id" uuid,
	"kind" text DEFAULT 'room' NOT NULL,
	"code" text,
	"name_en" text,
	"name_ar" text,
	"capacity" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "locations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "locations_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "locations_version_check" CHECK (version > 0),
	CONSTRAINT "locations_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "locations_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "locations_kind_check" CHECK (kind in ('room', 'lab', 'hall', 'library', 'sports', 'outdoor', 'building', 'external', 'other')),
	CONSTRAINT "locations_code_check" CHECK (char_length(code) between 1 and 32),
	CONSTRAINT "locations_name_en_check" CHECK (char_length(name_en) between 1 and 80),
	CONSTRAINT "locations_name_ar_check" CHECK (char_length(name_ar) between 1 and 80),
	CONSTRAINT "locations_capacity_check" CHECK (capacity > 0),
	CONSTRAINT "locations_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."login_identities" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"login_name" text,
	"secret_hash" text,
	"secret_set_at" timestamp with time zone,
	"compromised_at" timestamp with time zone,
	"pin_hash" text,
	"link_method" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"linked_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "login_identities_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "login_identities_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "login_identities_version_check" CHECK (version > 0),
	CONSTRAINT "login_identities_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "login_identities_kind_check" CHECK (kind in ('password', 'oidc', 'saml', 'clever', 'classlink', 'badge', 'invite', 'handoff')),
	CONSTRAINT "login_identities_login_name_check" CHECK (char_length(login_name) between 1 and 254 and login_name = lower(login_name)),
	CONSTRAINT "login_identities_secret_hash_check" CHECK (char_length(secret_hash) between 20 and 512),
	CONSTRAINT "login_identities_pin_hash_check" CHECK (char_length(pin_hash) between 20 and 512),
	CONSTRAINT "login_identities_link_method_check" CHECK (link_method in ('roster_external_id', 'verified_domain', 'invitation', 'admin', 'import', 'self_service')),
	CONSTRAINT "login_identities_failed_attempts_check" CHECK (failed_attempts between 0 and 100),
	CONSTRAINT "login_identities_void_reason_check" CHECK (void_reason in ('lost', 'rollover', 'aged_out', 'admin', 'compromised', 'unused', 'merge_pending', 'used')),
	CONSTRAINT "login_identities_password_check" CHECK ((kind = 'password') = (login_name is not null) and (kind <> 'password' or secret_hash is not null)),
	CONSTRAINT "login_identities_badge_check" CHECK (kind not in ('badge', 'invite', 'handoff') or (secret_hash is not null and expires_at is not null)),
	CONSTRAINT "login_identities_void_check" CHECK ((voided_at is null) = (void_reason is null))
);
--> statement-breakpoint
ALTER TABLE "core"."login_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."media_folders" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_folders_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_folders_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_folders_version_check" CHECK (version > 0),
	CONSTRAINT "media_folders_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "media_folders_name_check" CHECK (char_length(name) between 1 and 80),
	CONSTRAINT "media_folders_parent_id_check" CHECK (parent_id <> id)
);
--> statement-breakpoint
ALTER TABLE "core"."media_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."media_item_tags" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tagged_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_item_tags_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_item_tags_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_item_tags_version_check" CHECK (version > 0),
	CONSTRAINT "media_item_tags_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."media_item_texts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"file_id" uuid NOT NULL,
	"title" text,
	"caption" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_item_texts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_item_texts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_item_texts_version_check" CHECK (version > 0),
	CONSTRAINT "media_item_texts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "media_item_texts_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "media_item_texts_caption_check" CHECK (char_length(caption) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."media_item_texts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."media_tags" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "media_tags_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "media_tags_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "media_tags_version_check" CHECK (version > 0),
	CONSTRAINT "media_tags_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "media_tags_name_check" CHECK (char_length(name) between 1 and 40 and name = btrim(name))
);
--> statement-breakpoint
ALTER TABLE "core"."media_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."message_contacts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"email" text,
	"phone" text,
	"phone_normalized" text,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"user_id" uuid,
	"linked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complaint_at" timestamp with time zone,
	"merged_into_id" uuid,
	"merged_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "message_contacts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "message_contacts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "message_contacts_version_check" CHECK (version > 0),
	CONSTRAINT "message_contacts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "message_contacts_email_check" CHECK (email is null or (char_length(email) between 3 and 254 and email = lower(email) and strpos(email, '@') > 1)),
	CONSTRAINT "message_contacts_phone_check" CHECK (char_length(phone) between 1 and 40),
	CONSTRAINT "message_contacts_phone_normalized_check" CHECK (phone_normalized ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "message_contacts_reach_check" CHECK (status = 'tobedeleted' or email is not null or phone is not null),
	CONSTRAINT "message_contacts_display_name_check" CHECK (char_length(display_name) <= 120 and (status = 'tobedeleted' or char_length(display_name) >= 1)),
	CONSTRAINT "message_contacts_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "message_contacts_linked_check" CHECK ((user_id is null) = (linked_at is null)),
	CONSTRAINT "message_contacts_merged_check" CHECK ((merged_into_id is null) = (merged_at is null) and merged_into_id is distinct from id)
);
--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."message_drafts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"kind" text,
	"recipient_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"student_user_id" uuid,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "message_drafts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "message_drafts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "message_drafts_version_check" CHECK (version > 0),
	CONSTRAINT "message_drafts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "message_drafts_kind_check" CHECK (kind in ('direct', 'group', 'family')),
	CONSTRAINT "message_drafts_start_check" CHECK ((thread_id is null) = (kind is not null)),
	CONSTRAINT "message_drafts_reply_check" CHECK (thread_id is null or (cardinality(recipient_ids) = 0 and student_user_id is null and subject is null)),
	CONSTRAINT "message_drafts_recipient_ids_check" CHECK (cardinality(recipient_ids) <= 50),
	CONSTRAINT "message_drafts_subject_check" CHECK (char_length(subject) between 1 and 200),
	CONSTRAINT "message_drafts_body_check" CHECK (char_length(body) <= 5000)
);
--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."message_threads" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mailbox" text,
	"subject" text,
	"student_user_id" uuid,
	"created_by_user_id" uuid,
	"last_message_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "message_threads_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "message_threads_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "message_threads_version_check" CHECK (version > 0),
	CONSTRAINT "message_threads_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "message_threads_kind_check" CHECK (kind in ('direct', 'group', 'family', 'mailbox')),
	CONSTRAINT "message_threads_mailbox_check" CHECK (mailbox in ('admissions', 'attendance')),
	CONSTRAINT "message_threads_mailbox_kind_check" CHECK ((kind = 'mailbox') = (mailbox is not null)),
	CONSTRAINT "message_threads_subject_check" CHECK (char_length(subject) between 1 and 200),
	CONSTRAINT "message_threads_student_check" CHECK ((kind = 'family' and student_user_id is not null) or kind in ('mailbox', 'direct') or (student_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."message_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."messages" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"thread_id" uuid NOT NULL,
	"kind" text DEFAULT 'message' NOT NULL,
	"author_user_id" uuid,
	"author_contact_id" uuid,
	"body" text NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"redacted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "messages_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "messages_tenant_id_id_thread_id_key" UNIQUE("tenant_id","id","thread_id"),
	CONSTRAINT "messages_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "messages_version_check" CHECK (version > 0),
	CONSTRAINT "messages_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "messages_kind_check" CHECK (kind in ('message', 'note', 'call', 'meeting', 'email', 'event', 'held')),
	CONSTRAINT "messages_body_check" CHECK (char_length(body) <= 5000 and (redacted_at is not null or kind in ('event', 'call', 'meeting', 'email') or char_length(body) >= 1)),
	CONSTRAINT "messages_author_check" CHECK (num_nonnulls(author_user_id, author_contact_id) = case when kind = 'message' then 1 else num_nonnulls(author_user_id) end
        and (kind not in ('note', 'call', 'meeting', 'email') or author_user_id is not null)),
	CONSTRAINT "messages_details_check" CHECK (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192),
	CONSTRAINT "messages_redacted_check" CHECK (redacted_at is null or (body = '' and details = '{}'))
);
--> statement-breakpoint
ALTER TABLE "core"."messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."module_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"module_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"group_id" uuid,
	"student_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "module_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "module_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "module_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "module_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "module_audiences_member_check" CHECK ((group_id is null) <> (student_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."module_classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"module_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"audience" text DEFAULT 'class' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "module_classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "module_classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "module_classes_version_check" CHECK (version > 0),
	CONSTRAINT "module_classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "module_classes_position_check" CHECK (position between 0 and 999),
	CONSTRAINT "module_classes_audience_check" CHECK (audience in ('class', 'selected')),
	CONSTRAINT "module_classes_dates_check" CHECK ((starts_on is null) = (ends_on is null) and (ends_on is null or ends_on >= starts_on))
);
--> statement-breakpoint
ALTER TABLE "core"."module_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."module_discussions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"discussion_group" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "module_discussions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "module_discussions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "module_discussions_version_check" CHECK (version > 0),
	CONSTRAINT "module_discussions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."module_discussions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."module_templates" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"template_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "module_templates_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "module_templates_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "module_templates_version_check" CHECK (version > 0),
	CONSTRAINT "module_templates_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."module_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."org_features" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "org_features_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "org_features_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "org_features_version_check" CHECK (version > 0),
	CONSTRAINT "org_features_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "org_features_feature_check" CHECK (feature ~ '^[a-z][a-z0-9_]{1,39}$')
);
--> statement-breakpoint
ALTER TABLE "core"."org_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."orgs" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"type" text NOT NULL,
	"parent_id" uuid,
	"parent_type" text,
	"name_en" text,
	"name_ar" text,
	"identifier" text,
	"time_zone" text,
	"default_locale" text NOT NULL,
	"week_start" smallint DEFAULT 7 NOT NULL,
	"weekend_days" smallint[] DEFAULT '{5,6}'::smallint[] NOT NULL,
	"country_code" text,
	"learners_decide_from" smallint DEFAULT 18 NOT NULL,
	"learners_are_adults" boolean DEFAULT false NOT NULL,
	"secondary_calendar" text,
	"digits" text DEFAULT 'latn' NOT NULL,
	"arabic_math" text DEFAULT 'ltr' NOT NULL,
	"address" jsonb,
	"phone" text,
	"email" text,
	"logo_file_id" uuid,
	"brand_colour" text,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "orgs_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "orgs_tenant_id_id_type_key" UNIQUE("tenant_id","id","type"),
	CONSTRAINT "orgs_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "orgs_version_check" CHECK (version > 0),
	CONSTRAINT "orgs_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "orgs_type_check" CHECK (type in ('school_group', 'school', 'department')),
	CONSTRAINT "orgs_name_en_check" CHECK (char_length(name_en) between 1 and 160),
	CONSTRAINT "orgs_name_ar_check" CHECK (char_length(name_ar) between 1 and 160),
	CONSTRAINT "orgs_identifier_check" CHECK (char_length(identifier) between 1 and 64),
	CONSTRAINT "orgs_time_zone_check" CHECK (char_length(time_zone) between 1 and 64),
	CONSTRAINT "orgs_default_locale_check" CHECK (default_locale in ('ar', 'en')),
	CONSTRAINT "orgs_week_start_check" CHECK (week_start between 1 and 7),
	CONSTRAINT "orgs_weekend_days_check" CHECK (weekend_days <@ '{1,2,3,4,5,6,7}'),
	CONSTRAINT "orgs_secondary_calendar_check" CHECK (secondary_calendar in ('islamic-umalqura', 'islamic-civil')),
	CONSTRAINT "orgs_digits_check" CHECK (digits in ('latn', 'arab')),
	CONSTRAINT "orgs_arabic_math_check" CHECK (arabic_math in ('ltr', 'rtl')),
	CONSTRAINT "orgs_country_code_check" CHECK (country_code ~ '^[A-Z]{2}$'),
	CONSTRAINT "orgs_brand_colour_check" CHECK (brand_colour ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "orgs_learners_decide_from_check" CHECK (learners_decide_from between 1 and 25),
	CONSTRAINT "orgs_address_check" CHECK (jsonb_typeof(address) = 'object'),
	CONSTRAINT "orgs_phone_check" CHECK (char_length(phone) between 1 and 40),
	CONSTRAINT "orgs_email_check" CHECK (char_length(email) between 3 and 254),
	CONSTRAINT "orgs_lifecycle_check" CHECK (lifecycle in ('importing', 'active')),
	CONSTRAINT "orgs_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "orgs_parent_pair_check" CHECK ((parent_id is null) = (parent_type is null)),
	CONSTRAINT "orgs_hierarchy_check" CHECK ((type = 'school_group' and parent_id is null) or (type = 'school' and (parent_type is null or parent_type = 'school_group')) or (type = 'department' and parent_type in ('school', 'school_group'))),
	CONSTRAINT "orgs_school_time_zone_check" CHECK (type <> 'school' or time_zone is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."paced_lessons" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"shown_block_id" uuid,
	"shown_student_id" uuid,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "paced_lessons_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "paced_lessons_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "paced_lessons_version_check" CHECK (version > 0),
	CONSTRAINT "paced_lessons_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "paced_lessons_step_check" CHECK (step between 0 and 999),
	CONSTRAINT "paced_lessons_shown_check" CHECK ((shown_block_id is null) = (shown_student_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops"."partitioned_tables" (
	"schema_name" text,
	"table_name" text,
	"period" text NOT NULL,
	CONSTRAINT "partitioned_tables_pkey" PRIMARY KEY("schema_name","table_name"),
	CONSTRAINT "partitioned_tables_period_check" CHECK (period in ('month', 'year'))
);
--> statement-breakpoint
CREATE TABLE "core"."passkeys" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"account_id" uuid NOT NULL,
	"credential_id" bytea NOT NULL,
	"public_key" bytea NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"uv_initialized" boolean NOT NULL,
	"backup_eligible" boolean NOT NULL,
	"backup_state" boolean NOT NULL,
	"aaguid" uuid,
	"rp_id" text NOT NULL,
	"nickname" text,
	"attestation_object" bytea,
	"attestation_client_data_json" bytea,
	"created_from_ip_prefix" cidr,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "passkeys_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "passkeys_tenant_id_credential_id_key" UNIQUE("tenant_id","credential_id"),
	CONSTRAINT "passkeys_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "passkeys_version_check" CHECK (version > 0),
	CONSTRAINT "passkeys_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "passkeys_credential_id_check" CHECK (octet_length(credential_id) between 16 and 1023),
	CONSTRAINT "passkeys_public_key_check" CHECK (octet_length(public_key) between 16 and 2048),
	CONSTRAINT "passkeys_sign_count_check" CHECK (sign_count >= 0),
	CONSTRAINT "passkeys_transports_check" CHECK (transports <@ '{usb,nfc,ble,smart-card,hybrid,internal}'),
	CONSTRAINT "passkeys_rp_id_check" CHECK (char_length(rp_id) between 1 and 253),
	CONSTRAINT "passkeys_nickname_check" CHECK (char_length(nickname) between 1 and 64),
	CONSTRAINT "passkeys_revoked_reason_check" CHECK (revoked_reason in ('user', 'admin', 'account_disabled', 'compromised', 'tenant_merged')),
	CONSTRAINT "passkeys_backup_check" CHECK (backup_eligible or not backup_state),
	CONSTRAINT "passkeys_revoked_check" CHECK ((revoked_at is null) = (revoked_reason is null))
);
--> statement-breakpoint
ALTER TABLE "core"."passkeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."peer_review_comments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"review_id" uuid NOT NULL,
	"anchor" jsonb NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "peer_review_comments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "peer_review_comments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "peer_review_comments_version_check" CHECK (version > 0),
	CONSTRAINT "peer_review_comments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "peer_review_comments_anchor_check" CHECK (jsonb_typeof(anchor) = 'object'),
	CONSTRAINT "peer_review_comments_body_check" CHECK (char_length(body) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."peer_review_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."peer_review_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"reviews" smallint NOT NULL,
	"anonymous" boolean NOT NULL,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "peer_review_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "peer_review_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "peer_review_settings_version_check" CHECK (version > 0),
	CONSTRAINT "peer_review_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "peer_review_settings_reviews_check" CHECK (reviews between 1 and 5),
	CONSTRAINT "peer_review_settings_stages_check" CHECK ((released_at is null or started_at is not null) and (reminded_at is null or due_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."peer_review_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."peer_reviews" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"rubric_scores" jsonb DEFAULT '{}' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"suggestion" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"helpfulness" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "peer_reviews_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "peer_reviews_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "peer_reviews_version_check" CHECK (version > 0),
	CONSTRAINT "peer_reviews_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "peer_reviews_self_check" CHECK (reviewer_user_id <> author_user_id),
	CONSTRAINT "peer_reviews_rubric_scores_check" CHECK (jsonb_typeof(rubric_scores) = 'object' and octet_length(rubric_scores::text) <= 4096),
	CONSTRAINT "peer_reviews_comments_check" CHECK (char_length(strengths) <= 2000 and char_length(suggestion) <= 2000),
	CONSTRAINT "peer_reviews_sent_check" CHECK (sent_at is null or (strengths <> '' and suggestion <> '')),
	CONSTRAINT "peer_reviews_hidden_check" CHECK ((hidden_at is null) = (hidden_by_user_id is null)),
	CONSTRAINT "peer_reviews_helpfulness_check" CHECK (helpfulness is null or (helpfulness in ('very', 'somewhat', 'not') and sent_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."period_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"grading_period_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"score" numeric(7,2),
	"max_score" numeric(7,2) DEFAULT '100' NOT NULL,
	"comment" text,
	"grade_scale_version_id" uuid,
	"recorded_by_user_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "period_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "period_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "period_grades_version_check" CHECK (version > 0),
	CONSTRAINT "period_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "period_grades_max_score_check" CHECK (max_score > 0),
	CONSTRAINT "period_grades_score_check" CHECK (score is null or (score >= 0 and score <= max_score)),
	CONSTRAINT "period_grades_comment_check" CHECK (char_length(comment) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."period_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."privacy_notices" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"purpose_descriptor_id" uuid,
	"purpose_ns" text GENERATED ALWAYS AS ('consent_purpose') STORED NOT NULL,
	"org_id" uuid,
	"locale" text NOT NULL,
	"version_label" text NOT NULL,
	"document_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"supersedes_id" uuid,
	"translation_reviewed_at" timestamp with time zone,
	"translation_reviewed_by_user_id" uuid,
	"translation_source_digest" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "privacy_notices_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "privacy_notices_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "privacy_notices_version_check" CHECK (version > 0),
	CONSTRAINT "privacy_notices_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "privacy_notices_kind_check" CHECK (kind in ('privacy_notice', 'consent_text', 'directory_notice', 'coppa_direct_notice')),
	CONSTRAINT "privacy_notices_locale_check" CHECK (locale in ('ar', 'en')),
	CONSTRAINT "privacy_notices_version_label_check" CHECK (char_length(version_label) between 1 and 40),
	CONSTRAINT "privacy_notices_purpose_check" CHECK ((kind = 'consent_text') = (purpose_descriptor_id is not null)),
	CONSTRAINT "privacy_notices_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null))
);
--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."program_remarks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"finished_at" timestamp with time zone,
	"remarked" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "program_remarks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "program_remarks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "program_remarks_version_check" CHECK (version > 0),
	CONSTRAINT "program_remarks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "program_remarks_state_check" CHECK (state in ('pending', 'done')),
	CONSTRAINT "program_remarks_finished_check" CHECK ((state = 'done') = (finished_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."programme_categories" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"programme_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"weight" numeric(5,2) NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "programme_categories_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "programme_categories_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "programme_categories_version_check" CHECK (version > 0),
	CONSTRAINT "programme_categories_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "programme_categories_weight_check" CHECK (weight > 0 and weight <= 100),
	CONSTRAINT "programme_categories_title_en_check" CHECK (char_length(title_en) between 1 and 60),
	CONSTRAINT "programme_categories_title_ar_check" CHECK (char_length(title_ar) between 1 and 60),
	CONSTRAINT "programme_categories_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."programme_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."programme_grade_levels" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"programme_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "programme_grade_levels_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "programme_grade_levels_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "programme_grade_levels_version_check" CHECK (version > 0),
	CONSTRAINT "programme_grade_levels_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."programmes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"grade_scale_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "programmes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "programmes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "programmes_version_check" CHECK (version > 0),
	CONSTRAINT "programmes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "programmes_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "programmes_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "programmes_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."programmes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."quiz_answers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"block_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"fraction" numeric(5,4),
	"tries" smallint DEFAULT 0 NOT NULL,
	"hints" smallint DEFAULT 0 NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"feedback" text,
	"marked_by_user_id" uuid,
	"fluency" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quiz_answers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quiz_answers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "quiz_answers_version_check" CHECK (version > 0),
	CONSTRAINT "quiz_answers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "quiz_answers_attempt_check" CHECK (attempt between 1 and 100),
	CONSTRAINT "quiz_answers_response_check" CHECK (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
	CONSTRAINT "quiz_answers_fraction_check" CHECK (fraction is null or fraction between 0 and 1),
	CONSTRAINT "quiz_answers_state_check" CHECK (state in ('draft', 'marked', 'needs_marking') and (state <> 'draft' or fraction is null)),
	CONSTRAINT "quiz_answers_fluency_check" CHECK (fluency is null or (jsonb_typeof(fluency) = 'object' and octet_length(fluency::text) <= 16384)),
	CONSTRAINT "quiz_answers_feedback_check" CHECK (feedback is null or char_length(feedback) between 1 and 2000),
	CONSTRAINT "quiz_answers_practice_check" CHECK (tries between 0 and 100 and hints between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."quiz_draws" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"draw_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"bank_question_id" uuid NOT NULL,
	"question" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quiz_draws_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quiz_draws_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "quiz_draws_version_check" CHECK (version > 0),
	CONSTRAINT "quiz_draws_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "quiz_draws_attempt_check" CHECK (attempt between 1 and 100),
	CONSTRAINT "quiz_draws_position_check" CHECK (position between 0 and 19),
	CONSTRAINT "quiz_draws_question_check" CHECK (jsonb_typeof(question) = 'object' and octet_length(question::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "core"."quiz_draws" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."quiz_sittings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"breaks" smallint DEFAULT 0 NOT NULL,
	"break_seconds" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quiz_sittings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "quiz_sittings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "quiz_sittings_version_check" CHECK (version > 0),
	CONSTRAINT "quiz_sittings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "quiz_sittings_attempt_check" CHECK (attempt between 1 and 100),
	CONSTRAINT "quiz_sittings_ends_at_check" CHECK (ends_at is null or ends_at > started_at),
	CONSTRAINT "quiz_sittings_breaks_check" CHECK (breaks >= 0 and break_seconds >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."reading_norms" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"language" text NOT NULL,
	"rows" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "reading_norms_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "reading_norms_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "reading_norms_version_check" CHECK (version > 0),
	CONSTRAINT "reading_norms_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "reading_norms_language_check" CHECK (language in ('en', 'ar')),
	CONSTRAINT "reading_norms_rows_check" CHECK (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 60)
);
--> statement-breakpoint
ALTER TABLE "core"."reading_norms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"topic" text,
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
	CONSTRAINT "records_requests_topic_check" CHECK (topic is null or (topic in ('health') and kind = 'correction')),
	CONSTRAINT "records_requests_outcome_check" CHECK (outcome in ('completed', 'refused', 'withdrawn')),
	CONSTRAINT "records_requests_closed_check" CHECK ((outcome is null) = (closed_at is null) and (outcome is null) = (closed_by_user_id is null) and (outcome is null) = (outcome_note is null)),
	CONSTRAINT "records_requests_outcome_note_check" CHECK (char_length(outcome_note) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "core"."records_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."register_periods" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"class_period_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "register_periods_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "register_periods_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "register_periods_version_check" CHECK (version > 0),
	CONSTRAINT "register_periods_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."register_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."relationship_restrictions" (
	"tenant_id" uuid,
	"relationship_id" uuid,
	"contact_restrictions" text,
	"court_order_file_id" uuid,
	"court_order_file_purpose" text DEFAULT 'legal_document' NOT NULL,
	"verification_file_id" uuid,
	"verification_file_purpose" text DEFAULT 'evidence' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "relationship_restrictions_pkey" PRIMARY KEY("tenant_id","relationship_id"),
	CONSTRAINT "relationship_restrictions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "relationship_restrictions_version_check" CHECK (version > 0),
	CONSTRAINT "relationship_restrictions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "relationship_restrictions_contact_restrictions_check" CHECK (char_length(contact_restrictions) between 1 and 250),
	CONSTRAINT "relationship_restrictions_court_order_file_purpose_check" CHECK (court_order_file_purpose = 'legal_document'),
	CONSTRAINT "relationship_restrictions_verification_file_purpose_check" CHECK (verification_file_purpose = 'evidence')
);
--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."retention_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_rule" text,
	"student_value" smallint,
	"staff_years" smallint,
	"applicant_months" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "retention_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "retention_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "retention_settings_version_check" CHECK (version > 0),
	CONSTRAINT "retention_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "retention_settings_student_rule_check" CHECK (student_rule in ('years_after_leaving', 'until_age')),
	CONSTRAINT "retention_settings_student_value_check" CHECK ((student_rule is null) = (student_value is null) and (student_rule <> 'years_after_leaving' or student_value between 1 and 100) and (student_rule <> 'until_age' or student_value between 18 and 100)),
	CONSTRAINT "retention_settings_staff_years_check" CHECK (staff_years between 1 and 100),
	CONSTRAINT "retention_settings_applicant_months_check" CHECK (applicant_months between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."rubrics" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "rubrics_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "rubrics_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "rubrics_version_check" CHECK (version > 0),
	CONSTRAINT "rubrics_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "rubrics_title_check" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "rubrics_criteria_check" CHECK (jsonb_typeof(criteria) = 'object' and octet_length(criteria::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "core"."rubrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."saved_views" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"owner_user_id" uuid NOT NULL,
	"org_id" uuid,
	"surface" text NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "saved_views_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "saved_views_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "saved_views_version_check" CHECK (version > 0),
	CONSTRAINT "saved_views_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "saved_views_surface_check" CHECK (surface ~ '^[a-z][a-z0-9_.]{1,79}$'),
	CONSTRAINT "saved_views_name_check" CHECK (char_length(name) between 1 and 80),
	CONSTRAINT "saved_views_filter_check" CHECK (jsonb_typeof(filter) = 'object' and octet_length(filter::text) <= 8192)
);
--> statement-breakpoint
ALTER TABLE "core"."saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit"."seal_batches" (
	"tenant_id" uuid,
	"batch_no" bigint,
	"sealed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"event_count" integer NOT NULL,
	"root" bytea NOT NULL,
	"prev_hash" bytea,
	"hash" bytea NOT NULL,
	CONSTRAINT "seal_batches_pkey" PRIMARY KEY("tenant_id","batch_no"),
	CONSTRAINT "seal_batches_batch_no_check" CHECK (batch_no > 0),
	CONSTRAINT "seal_batches_event_count_check" CHECK (event_count >= 0),
	CONSTRAINT "seal_batches_root_check" CHECK (octet_length(root) = 32),
	CONSTRAINT "seal_batches_prev_hash_check" CHECK (octet_length(prev_hash) = 32),
	CONSTRAINT "seal_batches_hash_check" CHECK (octet_length(hash) = 32),
	CONSTRAINT "seal_batches_chain_check" CHECK ((batch_no = 1) = (prev_hash is null))
);
--> statement-breakpoint
ALTER TABLE "audit"."seal_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit"."seal_members" (
	"tenant_id" uuid,
	"event_id" uuid,
	"event_occurred_at" timestamp with time zone NOT NULL,
	"batch_no" bigint NOT NULL,
	CONSTRAINT "seal_members_pkey" PRIMARY KEY("tenant_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "audit"."seal_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"account_id" uuid NOT NULL,
	"token_hash" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"aal" smallint NOT NULL,
	"amr" text[] NOT NULL,
	"login_identity_id" uuid,
	"passkey_id" uuid,
	"context" text NOT NULL,
	"active_org_id" uuid,
	"active_role" text,
	"client_kind" text NOT NULL,
	"device_id" uuid,
	"ip_prefix" cidr,
	"user_agent_summary" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"replaced_by_session_id" uuid,
	CONSTRAINT "sessions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "sessions_tenant_id_token_hash_key" UNIQUE("tenant_id","token_hash"),
	CONSTRAINT "sessions_token_hash_check" CHECK (octet_length(token_hash) = 32),
	CONSTRAINT "sessions_aal_check" CHECK (aal between 1 and 3),
	CONSTRAINT "sessions_amr_check" CHECK (cardinality(amr) >= 1),
	CONSTRAINT "sessions_context_check" CHECK (context in ('staff', 'family', 'student')),
	CONSTRAINT "sessions_active_role_check" CHECK (active_role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative', 'applicant_family', 'applicant')),
	CONSTRAINT "sessions_client_kind_check" CHECK (client_kind in ('web', 'ios', 'android', 'shared_device')),
	CONSTRAINT "sessions_user_agent_summary_check" CHECK (char_length(user_agent_summary) between 1 and 200),
	CONSTRAINT "sessions_revoked_reason_check" CHECK (revoked_reason in ('sign_out', 'admin', 'credential_change', 'context_switch', 'reuse_detected', 'account_disabled', 'superseded', 'tenant_merged')),
	CONSTRAINT "sessions_authenticator_check" CHECK (num_nonnulls(login_identity_id, passkey_id) <= 1),
	CONSTRAINT "sessions_expiry_check" CHECK (idle_expires_at <= absolute_expires_at and authenticated_at <= last_seen_at),
	CONSTRAINT "sessions_revoked_check" CHECK ((revoked_at is null) = (revoked_reason is null))
);
--> statement-breakpoint
ALTER TABLE "core"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."shared_blocks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"kind" text DEFAULT 'block' NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "shared_blocks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "shared_blocks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "shared_blocks_version_check" CHECK (version > 0),
	CONSTRAINT "shared_blocks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "shared_blocks_scope_check" CHECK (scope in ('mine', 'school')),
	CONSTRAINT "shared_blocks_kind_check" CHECK (kind in ('block', 'section')),
	CONSTRAINT "shared_blocks_title_check" CHECK (char_length(title) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_categories" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_categories_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_categories_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_categories_version_check" CHECK (version > 0),
	CONSTRAINT "site_categories_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_categories_slug_check" CHECK (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "site_categories_name_check" CHECK (char_length(name_en) <= 100 and char_length(name_ar) <= 100 and (name_en <> '' or name_ar <> '')),
	CONSTRAINT "site_categories_position_check" CHECK (position between 0 and 999)
);
--> statement-breakpoint
ALTER TABLE "core"."site_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"shown" boolean DEFAULT false NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"level_en" text DEFAULT '' NOT NULL,
	"level_ar" text DEFAULT '' NOT NULL,
	"picture_file_id" uuid,
	"picture_alt_en" text DEFAULT '' NOT NULL,
	"picture_alt_ar" text DEFAULT '' NOT NULL,
	"picture_key" text,
	"picture" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_classes_version_check" CHECK (version > 0),
	CONSTRAINT "site_classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_classes_title_en_check" CHECK (char_length(title_en) <= 120),
	CONSTRAINT "site_classes_title_ar_check" CHECK (char_length(title_ar) <= 120),
	CONSTRAINT "site_classes_description_en_check" CHECK (char_length(description_en) <= 600),
	CONSTRAINT "site_classes_description_ar_check" CHECK (char_length(description_ar) <= 600),
	CONSTRAINT "site_classes_level_en_check" CHECK (char_length(level_en) <= 80),
	CONSTRAINT "site_classes_level_ar_check" CHECK (char_length(level_ar) <= 80),
	CONSTRAINT "site_classes_picture_alt_en_check" CHECK (char_length(picture_alt_en) <= 300),
	CONSTRAINT "site_classes_picture_alt_ar_check" CHECK (char_length(picture_alt_ar) <= 300),
	CONSTRAINT "site_classes_picture_check" CHECK (picture is null or jsonb_typeof(picture) = 'object')
);
--> statement-breakpoint
ALTER TABLE "core"."site_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_enquiries" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"page_id" uuid,
	"section_id" uuid,
	"locale" text NOT NULL,
	"purpose" text NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"phone_normalized" text,
	"child_name" text DEFAULT '' NOT NULL,
	"child_year" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"answers" jsonb DEFAULT '[]' NOT NULL,
	"network_key" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"closed_reason" text,
	"assignee_user_id" uuid,
	"first_responded_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"enquirer_user_id" uuid,
	"applicant_user_id" uuid,
	"thread_id" uuid,
	"handled_at" timestamp with time zone,
	"handled_by" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_enquiries_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_enquiries_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_enquiries_version_check" CHECK (version > 0),
	CONSTRAINT "site_enquiries_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_enquiries_source_check" CHECK (source in ('website', 'phone', 'email', 'walk_in', 'event', 'referral', 'other')),
	CONSTRAINT "site_enquiries_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_enquiries_purpose_check" CHECK (purpose in ('enquiry', 'visit', 'general')),
	CONSTRAINT "site_enquiries_name_check" CHECK (char_length(name) between 1 and 120),
	CONSTRAINT "site_enquiries_email_check" CHECK (email = '' or (char_length(email) between 3 and 254 and email like '%_@_%')),
	CONSTRAINT "site_enquiries_phone_check" CHECK (char_length(phone) <= 40),
	CONSTRAINT "site_enquiries_phone_normalized_check" CHECK (phone_normalized ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "site_enquiries_reach_check" CHECK (status = 'tobedeleted' or email <> '' or phone <> ''),
	CONSTRAINT "site_enquiries_child_name_check" CHECK (char_length(child_name) <= 120),
	CONSTRAINT "site_enquiries_child_year_check" CHECK (char_length(child_year) <= 60),
	CONSTRAINT "site_enquiries_message_check" CHECK (char_length(message) <= 2000),
	CONSTRAINT "site_enquiries_answers_check" CHECK (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 131072),
	CONSTRAINT "site_enquiries_network_key_check" CHECK (char_length(network_key) <= 128),
	CONSTRAINT "site_enquiries_state_check" CHECK (state in ('open', 'in_progress', 'converted', 'closed')),
	CONSTRAINT "site_enquiries_closed_reason_check" CHECK (closed_reason in ('answered', 'not_interested', 'another_school', 'not_eligible', 'no_places', 'no_response', 'duplicate', 'spam', 'other')),
	CONSTRAINT "site_enquiries_closed_check" CHECK ((state = 'closed') = (closed_reason is not null)),
	CONSTRAINT "site_enquiries_website_check" CHECK ((source = 'website') = (created_by_user_id is null)),
	CONSTRAINT "site_enquiries_handled_check" CHECK ((handled_at is null) = (handled_by is null))
);
--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_pages" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	"slug" text NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"in_menu" boolean DEFAULT true NOT NULL,
	"indexed" boolean DEFAULT true NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revised_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_pages_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_pages_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_pages_version_check" CHECK (version > 0),
	CONSTRAINT "site_pages_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_pages_parent_check" CHECK (parent_id is null or parent_id <> id),
	CONSTRAINT "site_pages_position_check" CHECK (position between 0 and 999),
	CONSTRAINT "site_pages_slug_check" CHECK (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "site_pages_title_check" CHECK (char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')),
	CONSTRAINT "site_pages_state_check" CHECK (state in ('draft', 'published', 'archived')),
	CONSTRAINT "site_pages_published_at_check" CHECK ((state = 'published') = (published_at is not null)),
	CONSTRAINT "site_pages_home_check" CHECK (not is_home or parent_id is null)
);
--> statement-breakpoint
ALTER TABLE "core"."site_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_posts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_posts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_posts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_posts_version_check" CHECK (version > 0),
	CONSTRAINT "site_posts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_posts_slug_check" CHECK (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "core"."site_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_published_pages" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"page_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"position" smallint NOT NULL,
	"is_home" boolean NOT NULL,
	"in_menu" boolean NOT NULL,
	"indexed" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"media" jsonb DEFAULT '{}' NOT NULL,
	"visible_from" timestamp with time zone NOT NULL,
	"revised_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_published_pages_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_published_pages_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_published_pages_version_check" CHECK (version > 0),
	CONSTRAINT "site_published_pages_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_published_pages_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_published_pages_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "site_published_pages_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576),
	CONSTRAINT "site_published_pages_media_check" CHECK (jsonb_typeof(media) = 'object')
);
--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_published_posts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"post_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"cover_key" text,
	"cover_alt" text DEFAULT '' NOT NULL,
	"pinned" boolean NOT NULL,
	"content" jsonb NOT NULL,
	"media" jsonb DEFAULT '{}' NOT NULL,
	"visible_from" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_published_posts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_published_posts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_published_posts_version_check" CHECK (version > 0),
	CONSTRAINT "site_published_posts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_published_posts_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "site_published_posts_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "site_published_posts_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576),
	CONSTRAINT "site_published_posts_media_check" CHECK (jsonb_typeof(media) = 'object')
);
--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_redirects" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_page_id" uuid,
	"to_url" text,
	"created_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_redirects_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_redirects_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_redirects_version_check" CHECK (version > 0),
	CONSTRAINT "site_redirects_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_redirects_from_path_check" CHECK (char_length(from_path) between 2 and 300 and from_path like '/%' and from_path not like '//%'),
	CONSTRAINT "site_redirects_to_url_check" CHECK (char_length(to_url) between 1 and 2048),
	CONSTRAINT "site_redirects_target_check" CHECK ((to_page_id is null) <> (to_url is null))
);
--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."site_settings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"bilingual" boolean DEFAULT true NOT NULL,
	"tagline_en" text DEFAULT '' NOT NULL,
	"tagline_ar" text DEFAULT '' NOT NULL,
	"social_links" jsonb DEFAULT '[]' NOT NULL,
	"banner_en" text DEFAULT '' NOT NULL,
	"banner_ar" text DEFAULT '' NOT NULL,
	"banner_tone" text DEFAULT 'info' NOT NULL,
	"banner_until" timestamp with time zone,
	"theme" jsonb DEFAULT '{}' NOT NULL,
	"chrome" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "site_settings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "site_settings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "site_settings_version_check" CHECK (version > 0),
	CONSTRAINT "site_settings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "site_settings_tagline_en_check" CHECK (char_length(tagline_en) <= 200),
	CONSTRAINT "site_settings_tagline_ar_check" CHECK (char_length(tagline_ar) <= 200),
	CONSTRAINT "site_settings_social_links_check" CHECK (jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 10),
	CONSTRAINT "site_settings_banner_en_check" CHECK (char_length(banner_en) <= 300),
	CONSTRAINT "site_settings_banner_ar_check" CHECK (char_length(banner_ar) <= 300),
	CONSTRAINT "site_settings_banner_tone_check" CHECK (banner_tone in ('info', 'warning', 'danger')),
	CONSTRAINT "site_settings_theme_check" CHECK (jsonb_typeof(theme) = 'object' and octet_length(theme::text) <= 8192),
	CONSTRAINT "site_settings_chrome_check" CHECK (jsonb_typeof(chrome) = 'object' and octet_length(chrome::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "core"."site_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops"."sms_suppressions" (
	"address_hmac" bytea,
	"sender_id" text,
	"suppressed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "sms_suppressions_pkey" PRIMARY KEY("address_hmac","sender_id"),
	CONSTRAINT "sms_suppressions_address_hmac_check" CHECK (octet_length(address_hmac) = 32),
	CONSTRAINT "sms_suppressions_sender_id_check" CHECK (char_length(sender_id) between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "core"."staff_absences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"span" daterange NOT NULL,
	"period_ids" uuid[],
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "staff_absences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "staff_absences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "staff_absences_version_check" CHECK (version > 0),
	CONSTRAINT "staff_absences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "staff_absences_span_check" CHECK (not isempty("span") and not lower_inf("span") and not upper_inf("span") and lower_inc("span") and not upper_inc("span")),
	CONSTRAINT "staff_absences_period_ids_check" CHECK (period_ids is null or cardinality(period_ids) between 1 and 50),
	CONSTRAINT "staff_absences_reason_check" CHECK (reason in ('illness', 'training', 'school_trip', 'personal', 'other')),
	CONSTRAINT "staff_absences_note_check" CHECK (char_length(note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."standard_evidence" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"source" text NOT NULL,
	"sitting_id" uuid NOT NULL,
	"sitting_kind" text GENERATED ALWAYS AS (case when source = 'lesson' then 'lesson' else 'work' end) STORED NOT NULL,
	"attempt" smallint NOT NULL,
	"block_id" uuid NOT NULL,
	"fraction" numeric(5,4) NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_evidence_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_evidence_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_evidence_version_check" CHECK (version > 0),
	CONSTRAINT "standard_evidence_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_evidence_source_check" CHECK (source in ('lesson', 'quiz', 'rubric')),
	CONSTRAINT "standard_evidence_attempt_check" CHECK (attempt between 1 and 1000),
	CONSTRAINT "standard_evidence_fraction_check" CHECK (fraction between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."standard_frameworks" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_identifier" uuid,
	"assessed" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_frameworks_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_frameworks_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_frameworks_version_check" CHECK (version > 0),
	CONSTRAINT "standard_frameworks_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_frameworks_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "standard_frameworks_description_check" CHECK (char_length(description) <= 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."standard_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."standard_observations" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"class_id" uuid,
	"level" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"observed_by_user_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_observations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_observations_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_observations_version_check" CHECK (version > 0),
	CONSTRAINT "standard_observations_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_observations_level_check" CHECK (level in ('beginning', 'developing', 'secure')),
	CONSTRAINT "standard_observations_note_check" CHECK (char_length(note) <= 500)
);
--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."standard_sittings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_sittings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_sittings_tenant_id_id_student_user_id_key" UNIQUE("tenant_id","id","student_user_id"),
	CONSTRAINT "standard_sittings_tenant_id_id_student_user_id_kind_key" UNIQUE("tenant_id","id","student_user_id","kind"),
	CONSTRAINT "standard_sittings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_sittings_version_check" CHECK (version > 0),
	CONSTRAINT "standard_sittings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_sittings_kind_check" CHECK (kind in ('lesson', 'work'))
);
--> statement-breakpoint
ALTER TABLE "core"."standard_sittings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."standards" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"framework_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text DEFAULT '' NOT NULL,
	"statement" text NOT NULL,
	"statement_ar" text,
	"item_type" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"source_identifier" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standards_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standards_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standards_version_check" CHECK (version > 0),
	CONSTRAINT "standards_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standards_code_check" CHECK (char_length(code) <= 60),
	CONSTRAINT "standards_statement_check" CHECK (char_length(statement) between 1 and 2000),
	CONSTRAINT "standards_statement_ar_check" CHECK (char_length(statement_ar) between 1 and 2000),
	CONSTRAINT "standards_item_type_check" CHECK (char_length(item_type) <= 60),
	CONSTRAINT "standards_position_check" CHECK (position >= 0),
	CONSTRAINT "standards_parent_check" CHECK (parent_id is distinct from id)
);
--> statement-breakpoint
ALTER TABLE "core"."standards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."student_departures" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"student_user_id" uuid NOT NULL,
	"left_on" date NOT NULL,
	"access_ends_on" date NOT NULL,
	"ended" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "student_departures_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "student_departures_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "student_departures_version_check" CHECK (version > 0),
	CONSTRAINT "student_departures_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "student_departures_org_type_check" CHECK (org_type = 'school'),
	CONSTRAINT "student_departures_access_check" CHECK (access_ends_on >= left_on),
	CONSTRAINT "student_departures_ended_check" CHECK (jsonb_typeof(ended) = 'object' and octet_length(ended::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "core"."student_departures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."student_grades" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"valid_during" daterange NOT NULL,
	"source" text NOT NULL,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "student_grades_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "student_grades_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "student_grades_version_check" CHECK (version > 0),
	CONSTRAINT "student_grades_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "student_grades_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during")),
	CONSTRAINT "student_grades_source_check" CHECK (source in ('manual', 'import', 'class', 'homeroom', 'rollover', 'admission'))
);
--> statement-breakpoint
ALTER TABLE "core"."student_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."student_movements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"direction" text NOT NULL,
	"at" time NOT NULL,
	"reason_descriptor_id" uuid,
	"reason_ns" text GENERATED ALWAYS AS ('attendance_reason') STORED NOT NULL,
	"collected_by_user_id" uuid,
	"collected_by_name" text,
	"note" text,
	"recorded_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "student_movements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "student_movements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "student_movements_version_check" CHECK (version > 0),
	CONSTRAINT "student_movements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "student_movements_direction_check" CHECK (direction in ('in', 'out')
        and (direction = 'out' or (collected_by_user_id is null and collected_by_name is null))),
	CONSTRAINT "student_movements_collected_by_name_check" CHECK (char_length(collected_by_name) between 1 and 120),
	CONSTRAINT "student_movements_note_check" CHECK (char_length(note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."student_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."student_school_years" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"valid_during" daterange NOT NULL,
	"entry_type_descriptor_id" uuid,
	"entry_type_ns" text GENERATED ALWAYS AS ('school_entry_type') STORED NOT NULL,
	"exit_type_descriptor_id" uuid,
	"exit_type_ns" text GENERATED ALWAYS AS ('school_exit_type') STORED NOT NULL,
	"next_year_outcome" text,
	"next_year_intention" text,
	"intention_by_user_id" uuid,
	"intention_at" timestamp with time zone,
	"previous_school" text,
	"destination_school" text,
	"source" text NOT NULL,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "student_school_years_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "student_school_years_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "student_school_years_version_check" CHECK (version > 0),
	CONSTRAINT "student_school_years_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "student_school_years_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "student_school_years_next_year_outcome_check" CHECK (next_year_outcome in ('promote', 'retain', 'leave', 'graduate')),
	CONSTRAINT "student_school_years_next_year_intention_check" CHECK (next_year_intention in ('returning', 'undecided', 'leaving')),
	CONSTRAINT "student_school_years_intention_recorded_check" CHECK ((next_year_intention is null) = (intention_at is null)),
	CONSTRAINT "student_school_years_source_check" CHECK (source in ('manual', 'import', 'sis', 'oneroster', 'rollover', 'admission')),
	CONSTRAINT "student_school_years_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and not upper_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during")),
	CONSTRAINT "student_school_years_previous_school_check" CHECK (char_length(previous_school) between 1 and 160),
	CONSTRAINT "student_school_years_destination_school_check" CHECK (char_length(destination_school) between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."submission_attempts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"submission_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"is_late" boolean NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"from_version" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "submission_attempts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "submission_attempts_tenant_id_id_submission_id_key" UNIQUE("tenant_id","id","submission_id"),
	CONSTRAINT "submission_attempts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "submission_attempts_version_check" CHECK (version > 0),
	CONSTRAINT "submission_attempts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "submission_attempts_number_check" CHECK (number between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."submissions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"excused" boolean DEFAULT false NOT NULL,
	"needs_revision" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "submissions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "submissions_tenant_id_id_student_user_id_key" UNIQUE("tenant_id","id","student_user_id"),
	CONSTRAINT "submissions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "submissions_version_check" CHECK (version > 0),
	CONSTRAINT "submissions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "submissions_state_check" CHECK (state in ('draft', 'submitted', 'returned'))
);
--> statement-breakpoint
ALTER TABLE "core"."submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."tenant_keys" (
	"tenant_id" uuid,
	"purpose" text,
	"key_version" integer,
	"kms_key_ref" text NOT NULL,
	"wrapped_dek" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"retired_at" timestamp with time zone,
	"destroyed_at" timestamp with time zone,
	CONSTRAINT "tenant_keys_pkey" PRIMARY KEY("tenant_id","purpose","key_version"),
	CONSTRAINT "tenant_keys_purpose_check" CHECK (purpose in ('health', 'identifiers', 'identifier_lookup', 'files')),
	CONSTRAINT "tenant_keys_key_version_check" CHECK (key_version > 0),
	CONSTRAINT "tenant_keys_kms_key_ref_check" CHECK (char_length(kms_key_ref) between 1 and 512),
	CONSTRAINT "tenant_keys_wrapped_dek_check" CHECK (octet_length(wrapped_dek) between 32 and 4096)
);
--> statement-breakpoint
ALTER TABLE "core"."tenant_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops"."tenant_registry" (
	"tenant_id" uuid PRIMARY KEY,
	"lifecycle" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"entitlements_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_registry_lifecycle_check" CHECK (lifecycle in ('provisioning', 'importing', 'active', 'read_only', 'frozen', 'suspended', 'offboarding'))
);
--> statement-breakpoint
CREATE TABLE "core"."tenants" (
	"tenant_id" uuid PRIMARY KEY,
	"kind" text NOT NULL,
	"root_org_id" uuid NOT NULL,
	"name_en" text,
	"name_ar" text,
	"default_locale" text DEFAULT 'ar' NOT NULL,
	"jurisdictions" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "tenants_kind_check" CHECK (kind in ('school_group', 'school')),
	CONSTRAINT "tenants_name_en_check" CHECK (char_length(name_en) between 1 and 160),
	CONSTRAINT "tenants_name_ar_check" CHECK (char_length(name_ar) between 1 and 160),
	CONSTRAINT "tenants_default_locale_check" CHECK (default_locale in ('ar', 'en')),
	CONSTRAINT "tenants_jurisdictions_check" CHECK (array_to_string(jurisdictions, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
	CONSTRAINT "tenants_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "tenants_version_check" CHECK (version > 0),
	CONSTRAINT "tenants_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "tenants_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."thread_members" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"thread_id" uuid NOT NULL,
	"user_id" uuid,
	"contact_id" uuid,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"reply_key" bytea,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "thread_members_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "thread_members_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "thread_members_version_check" CHECK (version > 0),
	CONSTRAINT "thread_members_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "thread_members_role_check" CHECK (role in ('owner', 'member', 'reader')),
	CONSTRAINT "thread_members_member_check" CHECK (user_id is not null or contact_id is not null),
	CONSTRAINT "thread_members_left_at_check" CHECK (left_at is null or left_at >= joined_at),
	CONSTRAINT "thread_members_reply_key_check" CHECK (reply_key is null or (contact_id is not null and octet_length(reply_key) = 32))
);
--> statement-breakpoint
ALTER TABLE "core"."thread_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."timetable_days" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"bell_schedule_id" uuid,
	"runs_as" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "timetable_days_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "timetable_days_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "timetable_days_version_check" CHECK (version > 0),
	CONSTRAINT "timetable_days_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "timetable_days_runs_as_check" CHECK (runs_as between 1 and 28),
	CONSTRAINT "timetable_days_shape_check" CHECK (num_nonnulls(bell_schedule_id, runs_as) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."timetable_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."timetables" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name_en" text,
	"name_ar" text,
	"starts_on" date NOT NULL,
	"cycle_kind" text NOT NULL,
	"cycle_length" smallint NOT NULL,
	"first_day" smallint DEFAULT 1 NOT NULL,
	"closures_move" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "timetables_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "timetables_tenant_id_id_org_id_key" UNIQUE("tenant_id","id","org_id"),
	CONSTRAINT "timetables_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "timetables_version_check" CHECK (version > 0),
	CONSTRAINT "timetables_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "timetables_name_en_check" CHECK (char_length(name_en) between 1 and 60),
	CONSTRAINT "timetables_name_ar_check" CHECK (char_length(name_ar) between 1 and 60),
	CONSTRAINT "timetables_cycle_check" CHECK ((cycle_kind = 'weeks' and cycle_length between 1 and 4)
        or (cycle_kind = 'days' and cycle_length between 2 and 20)),
	CONSTRAINT "timetables_first_day_check" CHECK (first_day between 1 and cycle_length)
);
--> statement-breakpoint
ALTER TABLE "core"."timetables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."user_preferences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "user_preferences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "user_preferences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "user_preferences_version_check" CHECK (version > 0),
	CONSTRAINT "user_preferences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "user_preferences_key_check" CHECK (key ~ '^[a-z][a-z0-9_.]{1,79}$'),
	CONSTRAINT "user_preferences_value_check" CHECK (octet_length(value::text) <= 8192)
);
--> statement-breakpoint
ALTER TABLE "core"."user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."user_relationships" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"related_user_id" uuid NOT NULL,
	"relation_descriptor_id" uuid NOT NULL,
	"relation_ns" text GENERATED ALWAYS AS ('relation') STORED NOT NULL,
	"relation_meaning" text NOT NULL,
	"legal_guardian" boolean,
	"educational_rights" text DEFAULT 'full' NOT NULL,
	"portal_access" boolean DEFAULT false NOT NULL,
	"receives_notifications" boolean DEFAULT false NOT NULL,
	"communication_isolated" boolean DEFAULT false NOT NULL,
	"primary_contact" boolean DEFAULT false NOT NULL,
	"emergency_contact" boolean DEFAULT false NOT NULL,
	"contact_priority" smallint,
	"residence" text,
	"pickup" text,
	"valid_during" daterange NOT NULL,
	"access_basis" text DEFAULT 'parental_authority' NOT NULL,
	"access_ends_at_majority" boolean DEFAULT true NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "user_relationships_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "user_relationships_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "user_relationships_version_check" CHECK (version > 0),
	CONSTRAINT "user_relationships_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "user_relationships_educational_rights_check" CHECK (educational_rights in ('full', 'restricted', 'none')),
	CONSTRAINT "user_relationships_contact_priority_check" CHECK (contact_priority between 1 and 99),
	CONSTRAINT "user_relationships_residence_check" CHECK (residence in ('primary', 'secondary', 'none')),
	CONSTRAINT "user_relationships_pickup_check" CHECK (pickup in ('allowed', 'not_allowed', 'ask_office')),
	CONSTRAINT "user_relationships_access_basis_check" CHECK (access_basis in ('parental_authority', 'court_appointed', 'student_consent', 'school_designated')),
	CONSTRAINT "user_relationships_verification_method_check" CHECK (verification_method in ('document', 'court_order', 'staff_attested', 'sis', 'import_unverified')),
	CONSTRAINT "user_relationships_self_check" CHECK (student_user_id <> related_user_id),
	CONSTRAINT "user_relationships_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during")),
	CONSTRAINT "user_relationships_verified_check" CHECK ((verified_at is null or verification_method is not null) and (verification_method is distinct from 'import_unverified' or verified_at is null)),
	CONSTRAINT "user_relationships_portal_check" CHECK (not portal_access or educational_rights <> 'none'),
	CONSTRAINT "user_relationships_non_relative_check" CHECK (relation_meaning <> 'non_relative' or not portal_access or access_basis = 'school_designated')
);
--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."user_roles" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"org_type" text NOT NULL,
	"role" text NOT NULL,
	"valid_during" daterange NOT NULL,
	"source" text NOT NULL,
	"position_descriptor_id" uuid,
	"position_ns" text GENERATED ALWAYS AS ('staff_position') STORED NOT NULL,
	"title_en" text,
	"title_ar" text,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "user_roles_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "user_roles_version_check" CHECK (version > 0),
	CONSTRAINT "user_roles_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "user_roles_role_check" CHECK (role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative', 'applicant_family', 'applicant')),
	CONSTRAINT "user_roles_source_check" CHECK (source in ('manual', 'import', 'sis', 'oneroster', 'sso_jit', 'derived')),
	CONSTRAINT "user_roles_title_en_check" CHECK (char_length(title_en) between 1 and 100),
	CONSTRAINT "user_roles_title_ar_check" CHECK (char_length(title_ar) between 1 and 100),
	CONSTRAINT "user_roles_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during")),
	CONSTRAINT "user_roles_org_type_check" CHECK (role = 'system_administrator' or (role = 'district_administrator' and org_type = 'school_group') or (role not in ('district_administrator', 'system_administrator') and org_type = 'school'))
);
--> statement-breakpoint
ALTER TABLE "core"."user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."users" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"username" text,
	"given_name_ar" text,
	"middle_name_ar" text,
	"family_name_ar" text,
	"full_name_ar" text,
	"given_name_en" text,
	"middle_name_en" text,
	"family_name_en" text,
	"full_name_en" text,
	"preferred_given_name" text,
	"preferred_middle_name" text,
	"preferred_family_name" text,
	"name_parts_source" text DEFAULT 'entered' NOT NULL,
	"birth_date" date,
	"birth_date_source" text,
	"sex_descriptor_id" uuid,
	"sex_ns" text GENERATED ALWAYS AS ('sex') STORED NOT NULL,
	"photo_file_id" uuid,
	"preferred_locale" text,
	"primary_org_id" uuid,
	"medical_alert" boolean DEFAULT false NOT NULL,
	"erased_at" timestamp with time zone,
	"import_run_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "users_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "users_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "users_version_check" CHECK (version > 0),
	CONSTRAINT "users_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "users_username_check" CHECK (char_length(username) between 1 and 254 and username = lower(username)),
	CONSTRAINT "users_given_name_ar_check" CHECK (char_length(given_name_ar) between 1 and 75),
	CONSTRAINT "users_middle_name_ar_check" CHECK (char_length(middle_name_ar) between 1 and 150),
	CONSTRAINT "users_family_name_ar_check" CHECK (char_length(family_name_ar) between 1 and 75),
	CONSTRAINT "users_full_name_ar_check" CHECK (char_length(full_name_ar) between 1 and 200),
	CONSTRAINT "users_given_name_en_check" CHECK (char_length(given_name_en) between 1 and 75),
	CONSTRAINT "users_middle_name_en_check" CHECK (char_length(middle_name_en) between 1 and 150),
	CONSTRAINT "users_family_name_en_check" CHECK (char_length(family_name_en) between 1 and 75),
	CONSTRAINT "users_full_name_en_check" CHECK (char_length(full_name_en) between 1 and 200),
	CONSTRAINT "users_preferred_given_name_check" CHECK (char_length(preferred_given_name) between 1 and 75),
	CONSTRAINT "users_preferred_middle_name_check" CHECK (char_length(preferred_middle_name) between 1 and 75),
	CONSTRAINT "users_preferred_family_name_check" CHECK (char_length(preferred_family_name) between 1 and 75),
	CONSTRAINT "users_name_parts_source_check" CHECK (name_parts_source in ('entered', 'import_split', 'import_parts')),
	CONSTRAINT "users_birth_date_check" CHECK (birth_date >= date '1900-01-01'),
	CONSTRAINT "users_birth_date_source_check" CHECK (birth_date_source in ('school_record', 'guardian_declared', 'document', 'import')),
	CONSTRAINT "users_preferred_locale_check" CHECK (preferred_locale in ('ar', 'en')),
	CONSTRAINT "users_name_check" CHECK (erased_at is not null or num_nonnulls(full_name_ar, full_name_en) >= 1),
	CONSTRAINT "users_ar_parts_check" CHECK (full_name_ar is not null or num_nonnulls(given_name_ar, middle_name_ar, family_name_ar) = 0),
	CONSTRAINT "users_en_parts_check" CHECK (full_name_en is not null or num_nonnulls(given_name_en, middle_name_en, family_name_en) = 0),
	CONSTRAINT "users_birth_source_check" CHECK (birth_date is not null or birth_date_source is null),
	CONSTRAINT "users_erased_check" CHECK (erased_at is null or status = 'tobedeleted')
);
--> statement-breakpoint
ALTER TABLE "core"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."work_comment_answers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"comment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"state" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "work_comment_answers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_comment_answers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "work_comment_answers_version_check" CHECK (version > 0),
	CONSTRAINT "work_comment_answers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "work_comment_answers_state_check" CHECK (state in ('fixed', 'unclear'))
);
--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."work_comment_replies" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"comment_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "work_comment_replies_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_comment_replies_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "work_comment_replies_version_check" CHECK (version > 0),
	CONSTRAINT "work_comment_replies_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "work_comment_replies_body_check" CHECK (char_length(body) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."work_comments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"attempt_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"anchor" jsonb NOT NULL,
	"body" text NOT NULL,
	"bank_comment_id" uuid,
	"kind" text,
	"criterion_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "work_comments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_comments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "work_comments_version_check" CHECK (version > 0),
	CONSTRAINT "work_comments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "work_comments_anchor_check" CHECK (jsonb_typeof(anchor) = 'object'),
	CONSTRAINT "work_comments_body_check" CHECK (char_length(body) between 1 and 2000),
	CONSTRAINT "work_comments_kind_check" CHECK (kind in ('fix', 'think', 'next')),
	CONSTRAINT "work_comments_criterion_id_check" CHECK (char_length(criterion_id) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "core"."work_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."work_sittings" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"sitting_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"kind" text GENERATED ALWAYS AS ('work') STORED NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "work_sittings_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_sittings_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "work_sittings_version_check" CHECK (version > 0),
	CONSTRAINT "work_sittings_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."work_sittings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."year_rollovers" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"source_year_id" uuid NOT NULL,
	"source_year_type" text DEFAULT 'school_year' NOT NULL,
	"target_year_id" uuid NOT NULL,
	"target_year_type" text DEFAULT 'school_year' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"plan" jsonb NOT NULL,
	"outcome" jsonb,
	"applied_at" timestamp with time zone,
	"applied_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "year_rollovers_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "year_rollovers_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "year_rollovers_version_check" CHECK (version > 0),
	CONSTRAINT "year_rollovers_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "year_rollovers_source_year_type_check" CHECK (source_year_type = 'school_year'),
	CONSTRAINT "year_rollovers_target_year_type_check" CHECK (target_year_type = 'school_year'),
	CONSTRAINT "year_rollovers_state_check" CHECK (state in ('draft', 'applied')),
	CONSTRAINT "year_rollovers_years_check" CHECK (source_year_id <> target_year_id),
	CONSTRAINT "year_rollovers_plan_check" CHECK (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 4194304),
	CONSTRAINT "year_rollovers_applied_check" CHECK ((state = 'applied') = (applied_at is not null and outcome is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."young_classes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "young_classes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "young_classes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "young_classes_version_check" CHECK (version > 0),
	CONSTRAINT "young_classes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."young_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "absence_reports_student_idx" ON "core"."absence_reports" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "absence_reports_open_idx" ON "core"."absence_reports" ("tenant_id","org_id") WHERE status = 'active' and decision = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_current_key" ON "core"."academic_sessions" ("tenant_id","org_id") WHERE type = 'school_year' and lifecycle = 'current' and status = 'active';--> statement-breakpoint
CREATE INDEX "academic_sessions_year_idx" ON "core"."academic_sessions" ("tenant_id","school_year_id","type");--> statement-breakpoint
CREATE INDEX "academic_sessions_delta_idx" ON "core"."academic_sessions" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_weeks_number_key" ON "core"."academic_weeks" ("tenant_id","school_year_id","number") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "access_arrangements_key" ON "core"."access_arrangements" ("tenant_id","org_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "access_role_assignments_user_idx" ON "core"."access_role_assignments" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "access_role_assignments_role_idx" ON "core"."access_role_assignments" ("tenant_id","access_role_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_key" ON "core"."accounts" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "accounts_delta_idx" ON "core"."accounts" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_applications_applicant_key" ON "core"."admission_applications" ("tenant_id","intake_id","applicant_user_id") WHERE status = 'active' and state <> 'withdrawn';--> statement-breakpoint
CREATE UNIQUE INDEX "admission_applications_reference_key" ON "core"."admission_applications" ("tenant_id","org_id","reference") WHERE reference is not null;--> statement-breakpoint
CREATE INDEX "admission_applications_intake_idx" ON "core"."admission_applications" ("tenant_id","intake_id","state") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_applications_filer_idx" ON "core"."admission_applications" ("tenant_id","filed_by_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_applications_applicant_idx" ON "core"."admission_applications" ("tenant_id","applicant_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_entries_application_idx" ON "core"."admission_entries" ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "admission_events_application_idx" ON "core"."admission_events" ("tenant_id","application_id","starts_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_events_day_idx" ON "core"."admission_events" ("tenant_id","org_id","starts_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_forms_org_idx" ON "core"."admission_forms" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_intakes_window_idx" ON "core"."admission_intakes" ("tenant_id","org_id","opens_on","closes_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "admission_items_key" ON "core"."admission_items" ("tenant_id","application_id","item_key") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "admission_letters_application_idx" ON "core"."admission_letters" ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_attempt_key" ON "core"."assessments" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_recipients_key" ON "core"."assignment_recipients" ("tenant_id","assignment_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assignment_recipients_student_idx" ON "core"."assignment_recipients" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_terms_assignment_key" ON "core"."assignment_terms" ("tenant_id","assignment_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assignment_terms_period_idx" ON "core"."assignment_terms" ("tenant_id","grading_period_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assignments_class_idx" ON "core"."assignments" ("tenant_id","class_id","state") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "assistant_requests_day_idx" ON "core"."assistant_requests" ("tenant_id","org_id","day");--> statement-breakpoint
CREATE INDEX "assistant_requests_host_idx" ON "core"."assistant_requests" ("tenant_id","host_type","host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_settings_org_key" ON "core"."assistant_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_registers_day_key" ON "core"."attendance_registers" ("tenant_id","class_id","taken_on") WHERE status = 'active' and kind = 'day';--> statement-breakpoint
CREATE INDEX "attendance_registers_day_idx" ON "core"."attendance_registers" ("tenant_id","org_id","taken_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_settings_org_key" ON "core"."attendance_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "auth_attempts_window_idx" ON "core"."auth_attempts" ("tenant_id","window_ends_at");--> statement-breakpoint
CREATE INDEX "bank_comments_org_idx" ON "core"."bank_comments" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "bank_questions_org_idx" ON "core"."bank_questions" ("tenant_id","org_id","scope") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "bell_schedules_school_idx" ON "core"."bell_schedules" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "breaches_org_idx" ON "core"."breaches" ("tenant_id","org_id","discovered_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcast_audiences_broadcast_idx" ON "core"."broadcast_audiences" ("tenant_id","broadcast_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_families_key" ON "core"."broadcast_families" ("tenant_id","broadcast_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_grades_key" ON "core"."broadcast_grades" ("tenant_id","broadcast_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcast_grades_grade_idx" ON "core"."broadcast_grades" ("tenant_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_recipients_key" ON "core"."broadcast_recipients" ("tenant_id","broadcast_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcast_recipients_user_idx" ON "core"."broadcast_recipients" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcasts_org_idx" ON "core"."broadcasts" ("tenant_id","org_id","publish_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "broadcasts_untold_idx" ON "core"."broadcasts" ("tenant_id","publish_at") WHERE status = 'active' and state = 'published' and told_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_dates_day_key" ON "core"."calendar_dates" ("tenant_id","org_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "calendar_event_audiences_event_idx" ON "core"."calendar_event_audiences" ("tenant_id","event_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_families_key" ON "core"."calendar_event_families" ("tenant_id","event_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_grades_key" ON "core"."calendar_event_grades" ("tenant_id","event_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "calendar_event_grades_grade_idx" ON "core"."calendar_event_grades" ("tenant_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "calendar_events_org_idx" ON "core"."calendar_events" ("tenant_id","org_id","starts_on","ends_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_token_key" ON "core"."calendar_feeds" ("tenant_id","token_hash") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_owner_key" ON "core"."calendar_feeds" ("tenant_id","user_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "caption_drafts_key" ON "core"."caption_drafts" ("tenant_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "caption_drafts_queue_idx" ON "core"."caption_drafts" ("tenant_id","created_at") WHERE status = 'active' and state in ('queued', 'working');--> statement-breakpoint
CREATE UNIQUE INDEX "class_grades_class_key" ON "core"."class_grades" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_grades_grade_idx" ON "core"."class_grades" ("tenant_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "class_grading_class_key" ON "core"."class_grading" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "class_group_members_key" ON "core"."class_group_members" ("tenant_id","group_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_groups_class_idx" ON "core"."class_groups" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "class_lesson_settings_class_key" ON "core"."class_lesson_settings" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_meetings_class_idx" ON "core"."class_meetings" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_meetings_teacher_idx" ON "core"."class_meetings" ("tenant_id","teacher_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "class_periods_extra_code_key" ON "core"."class_periods" ("tenant_id","bell_schedule_id","code") WHERE status = 'active' and bell_schedule_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "class_running_grades_class_key" ON "core"."class_running_grades" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "class_years_class_key" ON "core"."class_years" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_years_year_idx" ON "core"."class_years" ("tenant_id","school_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "classes_school_idx" ON "core"."classes" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "classes_delta_idx" ON "core"."classes" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "consent_guardians_relationship_idx" ON "core"."consent_guardians" ("tenant_id","relationship_id");--> statement-breakpoint
CREATE INDEX "consent_records_subject_idx" ON "core"."consent_records" ("tenant_id","subject_user_id","purpose_descriptor_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contact_points_lookup_idx" ON "core"."contact_points" ("tenant_id","kind","normalized") WHERE status = 'active' and normalized is not null;--> statement-breakpoint
CREATE INDEX "contact_points_user_idx" ON "core"."contact_points" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_points_user_value_key" ON "core"."contact_points" ("tenant_id","user_id","kind","normalized") WHERE status = 'active' and normalized is not null;--> statement-breakpoint
CREATE INDEX "contact_points_delta_idx" ON "core"."contact_points" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_code_key" ON "core"."courses" ("tenant_id","org_id","code") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "courses_delta_idx" ON "core"."courses" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "demographics_delta_idx" ON "core"."demographics" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "descriptor_overrides_key" ON "core"."descriptor_overrides" ("tenant_id","descriptor_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "descriptors_namespace_idx" ON "core"."descriptors" ("tenant_id","namespace","sort_order");--> statement-breakpoint
CREATE INDEX "devices_account_idx" ON "core"."devices" ("tenant_id","account_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_likes_key" ON "core"."discussion_likes" ("tenant_id","post_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "discussion_posts_assignment_idx" ON "core"."discussion_posts" ("tenant_id","assignment_id","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_comments_thread_idx" ON "core"."document_comments" ("tenant_id","thread_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "document_files_key" ON "core"."document_files" ("tenant_id","document_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_files_file_idx" ON "core"."document_files" ("tenant_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_holds_user_idx" ON "core"."document_holds" ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "document_links_document_idx" ON "core"."document_links" ("tenant_id","document_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_links_target_idx" ON "core"."document_links" ("tenant_id","target_type","target_id") WHERE status = 'active' and target_id is not null;--> statement-breakpoint
CREATE INDEX "document_templates_org_idx" ON "core"."document_templates" ("tenant_id","org_id","kind") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_builtin_key" ON "core"."document_templates" ("tenant_id","org_id","builtin_key") WHERE builtin_key is not null;--> statement-breakpoint
CREATE INDEX "document_threads_document_idx" ON "core"."document_threads" ("tenant_id","document_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "document_translations_key" ON "core"."document_translations" ("tenant_id","document_id","target_locale") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_versions_document_idx" ON "core"."document_versions" ("tenant_id","document_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_host_idx" ON "core"."documents" ("tenant_id","host_type","host_id");--> statement-breakpoint
CREATE INDEX "documents_translation_idx" ON "core"."documents" ("tenant_id","translation_of_id") WHERE translation_of_id is not null;--> statement-breakpoint
CREATE INDEX "emergency_contacts_user_idx" ON "core"."emergency_contacts" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "core"."enrollments" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_user_idx" ON "core"."enrollments" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_delta_idx" ON "core"."enrollments" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "erasure_approvals_subject_idx" ON "core"."erasure_approvals" ("tenant_id","subject_user_id");--> statement-breakpoint
CREATE INDEX "erasure_approvals_contact_idx" ON "core"."erasure_approvals" ("tenant_id","subject_contact_id") WHERE subject_contact_id is not null;--> statement-breakpoint
CREATE INDEX "erasure_items_object_idx" ON "core"."erasure_items" ("tenant_id","object_type","object_id");--> statement-breakpoint
CREATE INDEX "external_ids_user_idx" ON "core"."external_ids" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "external_ids_delta_idx" ON "core"."external_ids" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "family_shares_key" ON "core"."family_shares" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "family_shares_student_idx" ON "core"."family_shares" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "federated_identities_login_key" ON "core"."federated_identities" ("tenant_id","login_identity_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "federated_identities_subject_key" ON "core"."federated_identities" ("tenant_id","identity_provider_id","subject") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "file_previews_key" ON "core"."file_previews" ("tenant_id","storage_key") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "file_previews_queue_idx" ON "core"."file_previews" ("tenant_id","created_at") WHERE status = 'active' and state in ('queued', 'working');--> statement-breakpoint
CREATE INDEX "file_publications_file_idx" ON "core"."file_publications" ("tenant_id","file_id") WHERE status = 'active' and unpublished_at is null;--> statement-breakpoint
CREATE INDEX "file_publications_host_idx" ON "core"."file_publications" ("tenant_id","host_type","host_id") WHERE status = 'active' and unpublished_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "file_subjects_key" ON "core"."file_subjects" ("tenant_id","file_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "file_subjects_user_idx" ON "core"."file_subjects" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_host_idx" ON "core"."files" ("tenant_id","host_type","host_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_state_idx" ON "core"."files" ("tenant_id","state","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_storage_key_idx" ON "core"."files" ("tenant_id","storage_key");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "core"."files" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_stream_queue_idx" ON "core"."files" ("tenant_id","ready_at") WHERE status = 'active' and stream_state in ('queued', 'encoding');--> statement-breakpoint
CREATE INDEX "files_stream_unmeasured_idx" ON "core"."files" ("tenant_id","id") WHERE status = 'active' and stream_state = 'ready' and stream_bytes is null;--> statement-breakpoint
CREATE INDEX "files_library_idx" ON "core"."files" ("tenant_id","host_id","folder_id") WHERE status = 'active' and host_type = 'media_library';--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "core"."files" ("tenant_id","sha256") WHERE status = 'active' and state = 'ready' and encryption = 'bucket';--> statement-breakpoint
CREATE INDEX "files_trashed_idx" ON "core"."files" ("tenant_id","trashed_at") WHERE status = 'active' and trashed_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_judgements_key" ON "core"."goal_judgements" ("tenant_id","student_user_id","standard_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "goal_reports_key" ON "core"."goal_reports" ("tenant_id","student_user_id","framework_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "grade_level_settings_org_key" ON "core"."grade_level_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "grade_scale_versions_scale_idx" ON "core"."grade_scale_versions" ("tenant_id","scale_id","effective_from") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "grade_scales_org_idx" ON "core"."grade_scales" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "gradebook_settings_org_key" ON "core"."gradebook_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "requested_changes_student_idx" ON "health"."requested_changes" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "records_student_idx" ON "health"."records" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "homeroom_classes_class_key" ON "core"."homeroom_classes" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "homeroom_classes_homeroom_idx" ON "core"."homeroom_classes" ("tenant_id","homeroom_class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "homeroom_members_homeroom_idx" ON "core"."homeroom_members" ("tenant_id","homeroom_class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "homeroom_members_student_idx" ON "core"."homeroom_members" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_orgs_key" ON "core"."identity_provider_orgs" ("tenant_id","identity_provider_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "identity_providers_issuer_key" ON "core"."identity_providers" ("tenant_id","protocol","issuer") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "intake_grades_intake_key" ON "core"."intake_grades" ("tenant_id","intake_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "intake_grades_grade_idx" ON "core"."intake_grades" ("tenant_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "intake_years_intake_key" ON "core"."intake_years" ("tenant_id","intake_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "intake_years_year_idx" ON "core"."intake_years" ("tenant_id","school_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "learning_modules_org_idx" ON "core"."learning_modules" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "legal_holds_subject_idx" ON "core"."legal_holds" ("tenant_id","subject_user_id") WHERE status = 'active' and released_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_changes_key" ON "core"."lesson_changes" ("tenant_id","class_id","class_period_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lesson_changes_day_idx" ON "core"."lesson_changes" ("tenant_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lesson_changes_cover_idx" ON "core"."lesson_changes" ("tenant_id","cover_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_code_key" ON "core"."lesson_code" ("tenant_id","lesson_id","student_user_id","block_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_openings_key" ON "core"."lesson_openings" ("tenant_id","lesson_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_key" ON "core"."lesson_progress" ("tenant_id","lesson_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lesson_progress_student_idx" ON "core"."lesson_progress" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_projects_key" ON "core"."lesson_projects" ("tenant_id","lesson_id","student_user_id","block_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_releases_key" ON "core"."lesson_releases" ("tenant_id","lesson_id","class_id") WHERE status = 'active' and student_user_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_releases_student_key" ON "core"."lesson_releases" ("tenant_id","lesson_id","class_id","student_user_id") WHERE status = 'active' and student_user_id is not null;--> statement-breakpoint
CREATE INDEX "lesson_responses_student_idx" ON "core"."lesson_responses" ("tenant_id","lesson_id","student_user_id","attempt");--> statement-breakpoint
CREATE INDEX "lesson_runs_student_idx" ON "core"."lesson_runs" ("tenant_id","lesson_id","student_user_id","block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_shares_key" ON "core"."lesson_shares" ("tenant_id","lesson_id","student_user_id","block_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_sittings_sitting_key" ON "core"."lesson_sittings" ("tenant_id","sitting_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_sittings_key" ON "core"."lesson_sittings" ("tenant_id","lesson_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_watches_key" ON "core"."lesson_watches" ("tenant_id","lesson_id","student_user_id","video") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "lessons_module_idx" ON "core"."lessons" ("tenant_id","module_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code_key" ON "core"."locations" ("tenant_id","org_id","code") WHERE status = 'active' and code is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identities_login_name_key" ON "core"."login_identities" ("tenant_id","login_name") WHERE status = 'active' and kind = 'password' and voided_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identities_badge_key" ON "core"."login_identities" ("tenant_id","secret_hash") WHERE status = 'active' and kind = 'badge' and voided_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identities_invite_key" ON "core"."login_identities" ("tenant_id","secret_hash") WHERE status = 'active' and kind = 'invite' and voided_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identities_handoff_key" ON "core"."login_identities" ("tenant_id","secret_hash") WHERE status = 'active' and kind = 'handoff' and voided_at is null;--> statement-breakpoint
CREATE INDEX "login_identities_account_idx" ON "core"."login_identities" ("tenant_id","account_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "media_folders_parent_idx" ON "core"."media_folders" ("tenant_id","org_id","parent_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_tags_key" ON "core"."media_item_tags" ("tenant_id","file_id","tag_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "media_item_tags_tag_idx" ON "core"."media_item_tags" ("tenant_id","tag_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_texts_file_key" ON "core"."media_item_texts" ("tenant_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "media_tags_name_key" ON "core"."media_tags" ("tenant_id","org_id",lower("name")) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "message_contacts_merged_idx" ON "core"."message_contacts" ("tenant_id","merged_into_id") WHERE merged_into_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_contacts_email_key" ON "core"."message_contacts" ("tenant_id","email") WHERE status = 'active' and email is not null;--> statement-breakpoint
CREATE INDEX "message_contacts_user_idx" ON "core"."message_contacts" ("tenant_id","user_id") WHERE status = 'active' and user_id is not null;--> statement-breakpoint
CREATE INDEX "message_contacts_phone_idx" ON "core"."message_contacts" ("tenant_id","phone_normalized") WHERE status = 'active' and phone_normalized is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_drafts_reply_key" ON "core"."message_drafts" ("tenant_id","thread_id","user_id") WHERE status = 'active' and thread_id is not null;--> statement-breakpoint
CREATE INDEX "message_drafts_user_idx" ON "core"."message_drafts" ("tenant_id","user_id","org_id","date_last_modified") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "message_threads_org_idx" ON "core"."message_threads" ("tenant_id","org_id","last_message_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "message_threads_mailbox_idx" ON "core"."message_threads" ("tenant_id","org_id","mailbox","last_message_at") WHERE status = 'active' and mailbox is not null;--> statement-breakpoint
CREATE INDEX "message_threads_student_idx" ON "core"."message_threads" ("tenant_id","mailbox","student_user_id") WHERE status = 'active' and student_user_id is not null;--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "core"."messages" ("tenant_id","thread_id","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "messages_email_key" ON "core"."messages" ("tenant_id",(details ->> 'emailId')) WHERE details ? 'emailId';--> statement-breakpoint
CREATE INDEX "messages_logged_idx" ON "core"."messages" ("tenant_id",(details ->> 'studentId'),(details ->> 'on')) WHERE status = 'active' and details ? 'studentId';--> statement-breakpoint
CREATE UNIQUE INDEX "module_audiences_group_key" ON "core"."module_audiences" ("tenant_id","module_id","class_id","group_id") WHERE status = 'active' and group_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "module_audiences_student_key" ON "core"."module_audiences" ("tenant_id","module_id","class_id","student_user_id") WHERE status = 'active' and student_user_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "module_classes_key" ON "core"."module_classes" ("tenant_id","module_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "module_classes_class_idx" ON "core"."module_classes" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "module_discussions_assignment_key" ON "core"."module_discussions" ("tenant_id","assignment_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "module_discussions_class_key" ON "core"."module_discussions" ("tenant_id","discussion_group","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "module_templates_template_key" ON "core"."module_templates" ("tenant_id","template_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "org_features_key" ON "core"."org_features" ("tenant_id","org_id","feature") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_root_key" ON "core"."orgs" ("tenant_id") WHERE parent_id is null and status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_identifier_key" ON "core"."orgs" ("tenant_id","identifier") WHERE status = 'active' and identifier is not null;--> statement-breakpoint
CREATE INDEX "orgs_parent_idx" ON "core"."orgs" ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "orgs_delta_idx" ON "core"."orgs" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "paced_lessons_running_key" ON "core"."paced_lessons" ("tenant_id","lesson_id","class_id") WHERE status = 'active' and ended_at is null;--> statement-breakpoint
CREATE INDEX "passkeys_account_idx" ON "core"."passkeys" ("tenant_id","account_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "peer_review_comments_review_idx" ON "core"."peer_review_comments" ("tenant_id","review_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "peer_review_settings_assignment_key" ON "core"."peer_review_settings" ("tenant_id","assignment_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "peer_reviews_key" ON "core"."peer_reviews" ("tenant_id","assignment_id","reviewer_user_id","author_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "peer_reviews_assignment_idx" ON "core"."peer_reviews" ("tenant_id","assignment_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "period_grades_key" ON "core"."period_grades" ("tenant_id","class_id","grading_period_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_notices_draft_key" ON "core"."privacy_notices" ("tenant_id","org_id","kind","purpose_descriptor_id") WHERE status = 'active' and published_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_notices_version_key" ON "core"."privacy_notices" ("tenant_id","org_id","kind","purpose_descriptor_id","version_label") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "program_remarks_pending_key" ON "core"."program_remarks" ("tenant_id","lesson_id","block_id") WHERE status = 'active' and state = 'pending';--> statement-breakpoint
CREATE INDEX "programme_categories_programme_idx" ON "core"."programme_categories" ("tenant_id","programme_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "programme_grade_levels_key" ON "core"."programme_grade_levels" ("tenant_id","programme_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "programme_grade_levels_level_idx" ON "core"."programme_grade_levels" ("tenant_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "programmes_org_idx" ON "core"."programmes" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_key" ON "core"."quiz_answers" ("tenant_id","submission_id","attempt","block_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_draws_key" ON "core"."quiz_draws" ("tenant_id","submission_id","attempt","draw_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "quiz_draws_bank_question_idx" ON "core"."quiz_draws" ("tenant_id","bank_question_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sittings_key" ON "core"."quiz_sittings" ("tenant_id","submission_id","attempt") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "quiz_sittings_open_idx" ON "core"."quiz_sittings" ("tenant_id","ends_at") WHERE status = 'active' and closed_at is null and ends_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reading_norms_key" ON "core"."reading_norms" ("tenant_id","org_id","language") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "records_requests_open_idx" ON "core"."records_requests" ("tenant_id","org_id","due_on") WHERE status = 'active' and outcome is null;--> statement-breakpoint
CREATE INDEX "records_requests_subject_idx" ON "core"."records_requests" ("tenant_id","subject_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "register_periods_register_key" ON "core"."register_periods" ("tenant_id","register_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "register_periods_key" ON "core"."register_periods" ("tenant_id","class_id","taken_on","class_period_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "retention_settings_org_key" ON "core"."retention_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "rubrics_owner_idx" ON "core"."rubrics" ("tenant_id","owner_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "core"."saved_views" ("tenant_id","owner_user_id","surface") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "saved_views_shared_idx" ON "core"."saved_views" ("tenant_id","org_id","surface") WHERE status = 'active' and shared;--> statement-breakpoint
CREATE INDEX "seal_members_batch_idx" ON "audit"."seal_members" ("tenant_id","batch_no");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "core"."sessions" ("tenant_id","account_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "core"."sessions" ("tenant_id","absolute_expires_at");--> statement-breakpoint
CREATE INDEX "shared_blocks_org_idx" ON "core"."shared_blocks" ("tenant_id","org_id","scope") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_categories_slug_key" ON "core"."site_categories" ("tenant_id","org_id","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_classes_class_key" ON "core"."site_classes" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_classes_shown_idx" ON "core"."site_classes" ("tenant_id","org_id") WHERE status = 'active' and shown;--> statement-breakpoint
CREATE INDEX "site_enquiries_org_idx" ON "core"."site_enquiries" ("tenant_id","org_id","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_enquiries_state_idx" ON "core"."site_enquiries" ("tenant_id","org_id","state","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_enquiries_assignee_idx" ON "core"."site_enquiries" ("tenant_id","assignee_user_id","state") WHERE status = 'active' and assignee_user_id is not null;--> statement-breakpoint
CREATE INDEX "site_enquiries_email_idx" ON "core"."site_enquiries" ("tenant_id","org_id",lower(email)) WHERE status = 'active' and email <> '';--> statement-breakpoint
CREATE INDEX "site_enquiries_network_idx" ON "core"."site_enquiries" ("tenant_id","network_key","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_enquiries_phone_idx" ON "core"."site_enquiries" ("tenant_id","org_id","phone_normalized") WHERE status = 'active' and phone_normalized is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "site_enquiries_thread_key" ON "core"."site_enquiries" ("tenant_id","thread_id") WHERE thread_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_slug_key" ON "core"."site_pages" ("tenant_id","org_id","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_home_key" ON "core"."site_pages" ("tenant_id","org_id") WHERE status = 'active' and is_home;--> statement-breakpoint
CREATE INDEX "site_pages_tree_idx" ON "core"."site_pages" ("tenant_id","org_id","parent_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_posts_broadcast_key" ON "core"."site_posts" ("tenant_id","broadcast_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_posts_slug_key" ON "core"."site_posts" ("tenant_id","org_id","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_published_pages_key" ON "core"."site_published_pages" ("tenant_id","page_id","locale") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_published_pages_slug_idx" ON "core"."site_published_pages" ("tenant_id","org_id","locale","slug") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_published_posts_key" ON "core"."site_published_posts" ("tenant_id","post_id","locale") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "site_published_posts_org_idx" ON "core"."site_published_posts" ("tenant_id","org_id","locale","visible_from") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_redirects_from_key" ON "core"."site_redirects" ("tenant_id","org_id","from_path") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "site_settings_org_key" ON "core"."site_settings" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "staff_absences_user_idx" ON "core"."staff_absences" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "standard_evidence_key" ON "core"."standard_evidence" ("tenant_id","sitting_id","attempt","block_id","standard_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "standard_evidence_student_idx" ON "core"."standard_evidence" ("tenant_id","student_user_id","standard_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "standard_frameworks_source_key" ON "core"."standard_frameworks" ("tenant_id","org_id","source_identifier") WHERE status = 'active' and source_identifier is not null;--> statement-breakpoint
CREATE INDEX "standard_frameworks_org_idx" ON "core"."standard_frameworks" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "standard_observations_student_idx" ON "core"."standard_observations" ("tenant_id","student_user_id","standard_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "standards_source_key" ON "core"."standards" ("tenant_id","framework_id","source_identifier") WHERE status = 'active' and source_identifier is not null;--> statement-breakpoint
CREATE INDEX "standards_framework_idx" ON "core"."standards" ("tenant_id","framework_id","parent_id","position") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "student_departures_student_key" ON "core"."student_departures" ("tenant_id","org_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_grades_student_idx" ON "core"."student_grades" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_grades_grade_idx" ON "core"."student_grades" ("tenant_id","org_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_movements_day_idx" ON "core"."student_movements" ("tenant_id","org_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_school_years_student_idx" ON "core"."student_school_years" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_school_years_year_idx" ON "core"."student_school_years" ("tenant_id","school_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_school_years_delta_idx" ON "core"."student_school_years" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_attempts_number_key" ON "core"."submission_attempts" ("tenant_id","submission_id","number") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_key" ON "core"."submissions" ("tenant_id","assignment_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "submissions_student_idx" ON "core"."submissions" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_keys_active_key" ON "core"."tenant_keys" ("tenant_id","purpose") WHERE retired_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_members_key" ON "core"."thread_members" ("tenant_id","thread_id","user_id") WHERE status = 'active' and left_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_members_contact_key" ON "core"."thread_members" ("tenant_id","thread_id","contact_id") WHERE status = 'active' and left_at is null and contact_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_members_reply_key" ON "core"."thread_members" ("tenant_id","reply_key") WHERE reply_key is not null;--> statement-breakpoint
CREATE INDEX "thread_members_user_idx" ON "core"."thread_members" ("tenant_id","user_id") WHERE status = 'active' and left_at is null;--> statement-breakpoint
CREATE INDEX "thread_members_contact_idx" ON "core"."thread_members" ("tenant_id","contact_id") WHERE status = 'active' and contact_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_days_day_key" ON "core"."timetable_days" ("tenant_id","org_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "timetables_start_key" ON "core"."timetables" ("tenant_id","org_id","starts_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_key" ON "core"."user_preferences" ("tenant_id","user_id","key") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "user_relationships_related_idx" ON "core"."user_relationships" ("tenant_id","related_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "user_relationships_student_idx" ON "core"."user_relationships" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "user_relationships_delta_idx" ON "core"."user_relationships" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "user_roles_org_role_idx" ON "core"."user_roles" ("tenant_id","org_id","role") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "core"."user_roles" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "user_roles_delta_idx" ON "core"."user_roles" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "core"."users" ("tenant_id","username") WHERE status = 'active' and username is not null;--> statement-breakpoint
CREATE INDEX "users_name_ar_idx" ON "core"."users" ("tenant_id",full_name_ar collate "ar-x-icu","id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "users_name_en_idx" ON "core"."users" ("tenant_id",full_name_en collate "en-x-icu","id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "users_birth_date_idx" ON "core"."users" ("tenant_id","birth_date") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "users_delta_idx" ON "core"."users" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "work_comment_answers_key" ON "core"."work_comment_answers" ("tenant_id","comment_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "work_comment_replies_comment_idx" ON "core"."work_comment_replies" ("tenant_id","comment_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "work_comments_attempt_idx" ON "core"."work_comments" ("tenant_id","attempt_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "work_sittings_sitting_key" ON "core"."work_sittings" ("tenant_id","sitting_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "work_sittings_key" ON "core"."work_sittings" ("tenant_id","submission_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "year_rollovers_years_key" ON "core"."year_rollovers" ("tenant_id","source_year_id","target_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "young_classes_class_key" ON "core"."young_classes" ("tenant_id","class_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_reported_by_user_id_fkey" FOREIGN KEY ("tenant_id","reported_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_decided_by_user_id_fkey" FOREIGN KEY ("tenant_id","decided_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_reason_descriptor_id_reason_ns_fkey" FOREIGN KEY ("tenant_id","reason_descriptor_id","reason_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."academic_sessions" ADD CONSTRAINT "academic_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."academic_sessions" ADD CONSTRAINT "academic_sessions_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."academic_sessions" ADD CONSTRAINT "academic_sessions_tenant_id_parent_id_parent_type_school_y_fkey" FOREIGN KEY ("tenant_id","parent_id","parent_type","school_year_id","org_id","school_year") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id","school_year");--> statement-breakpoint
ALTER TABLE "core"."academic_weeks" ADD CONSTRAINT "academic_weeks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ADD CONSTRAINT "access_arrangements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ADD CONSTRAINT "access_arrangements_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ADD CONSTRAINT "access_arrangements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_role_assignments" ADD CONSTRAINT "access_role_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."access_role_assignments" ADD CONSTRAINT "access_role_assignments_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_role_assignments" ADD CONSTRAINT "access_role_assignments_tenant_id_access_role_id_fkey" FOREIGN KEY ("tenant_id","access_role_id") REFERENCES "core"."access_roles"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_role_assignments" ADD CONSTRAINT "access_role_assignments_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_role_assignments" ADD CONSTRAINT "access_role_assignments_tenant_id_granted_by_user_id_fkey" FOREIGN KEY ("tenant_id","granted_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_roles" ADD CONSTRAINT "access_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."access_roles" ADD CONSTRAINT "access_roles_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."accounts" ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."accounts" ADD CONSTRAINT "accounts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."accounts" ADD CONSTRAINT "accounts_tenant_id_state_changed_by_user_id_fkey" FOREIGN KEY ("tenant_id","state_changed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_intake_id_fkey" FOREIGN KEY ("tenant_id","intake_id") REFERENCES "core"."admission_intakes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_form_version_id_fkey" FOREIGN KEY ("tenant_id","form_version_id") REFERENCES "core"."admission_form_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_filed_by_user_id_fkey" FOREIGN KEY ("tenant_id","filed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_applicant_user_id_fkey" FOREIGN KEY ("tenant_id","applicant_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_enquiry_id_fkey" FOREIGN KEY ("tenant_id","enquiry_id") REFERENCES "core"."site_enquiries"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_decided_by_user_id_fkey" FOREIGN KEY ("tenant_id","decided_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_deferred_from_id_fkey" FOREIGN KEY ("tenant_id","deferred_from_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_entries" ADD CONSTRAINT "admission_entries_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_events" ADD CONSTRAINT "admission_events_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id","item_id") REFERENCES "core"."admission_items"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_form_id_fkey" FOREIGN KEY ("tenant_id","form_id") REFERENCES "core"."admission_forms"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_tenant_id_published_by_user_id_fkey" FOREIGN KEY ("tenant_id","published_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ADD CONSTRAINT "admission_intakes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_intakes" ADD CONSTRAINT "admission_intakes_tenant_id_form_id_fkey" FOREIGN KEY ("tenant_id","form_id") REFERENCES "core"."admission_forms"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_items" ADD CONSTRAINT "admission_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_items" ADD CONSTRAINT "admission_items_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_items" ADD CONSTRAINT "admission_items_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_application_id_fkey" FOREIGN KEY ("tenant_id","application_id") REFERENCES "core"."admission_applications"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."admission_letters" ADD CONSTRAINT "admission_letters_tenant_id_sent_by_user_id_fkey" FOREIGN KEY ("tenant_id","sent_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "audit"."anchors" ADD CONSTRAINT "anchors_tenant_id_batch_no_fkey" FOREIGN KEY ("tenant_id","batch_no") REFERENCES "audit"."seal_batches"("tenant_id","batch_no");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_attempt_id_submission_id_fkey" FOREIGN KEY ("tenant_id","attempt_id","submission_id") REFERENCES "core"."submission_attempts"("tenant_id","id","submission_id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_graded_by_user_id_fkey" FOREIGN KEY ("tenant_id","graded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assessments" ADD CONSTRAINT "assessments_tenant_id_grade_scale_version_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_version_id") REFERENCES "core"."grade_scale_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id","group_id") REFERENCES "core"."class_groups"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_terms" ADD CONSTRAINT "assignment_terms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assignment_terms" ADD CONSTRAINT "assignment_terms_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_terms" ADD CONSTRAINT "assignment_terms_tenant_id_grading_period_id_fkey" FOREIGN KEY ("tenant_id","grading_period_id") REFERENCES "core"."academic_sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."programme_categories"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ADD CONSTRAINT "assistant_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ADD CONSTRAINT "assistant_requests_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assistant_requests" ADD CONSTRAINT "assistant_requests_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assistant_settings" ADD CONSTRAINT "assistant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."assistant_settings" ADD CONSTRAINT "assistant_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_registers" ADD CONSTRAINT "attendance_registers_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD CONSTRAINT "attendance_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD CONSTRAINT "attendance_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."auth_attempts" ADD CONSTRAINT "auth_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."bank_comments" ADD CONSTRAINT "bank_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."bank_comments" ADD CONSTRAINT "bank_comments_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."bank_questions" ADD CONSTRAINT "bank_questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."bank_questions" ADD CONSTRAINT "bank_questions_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."bank_questions" ADD CONSTRAINT "bank_questions_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" ADD CONSTRAINT "bell_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" ADD CONSTRAINT "bell_schedules_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_closed_by_user_id_fkey" FOREIGN KEY ("tenant_id","closed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."breaches" ADD CONSTRAINT "breaches_tenant_id_logged_by_user_id_fkey" FOREIGN KEY ("tenant_id","logged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_audiences" ADD CONSTRAINT "broadcast_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_families" ADD CONSTRAINT "broadcast_families_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_families" ADD CONSTRAINT "broadcast_families_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_grades" ADD CONSTRAINT "broadcast_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_grades" ADD CONSTRAINT "broadcast_grades_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_grades" ADD CONSTRAINT "broadcast_grades_tenant_id_grade_level_descriptor_id_grade_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_cover_file_id_fkey" FOREIGN KEY ("tenant_id","cover_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_tenant_id_event_descriptor_id_event_ns_fkey" FOREIGN KEY ("tenant_id","event_descriptor_id","event_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "core"."calendar_events"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_families" ADD CONSTRAINT "calendar_event_families_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_families" ADD CONSTRAINT "calendar_event_families_tenant_id_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "core"."calendar_events"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_grades" ADD CONSTRAINT "calendar_event_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_grades" ADD CONSTRAINT "calendar_event_grades_tenant_id_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "core"."calendar_events"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_grades" ADD CONSTRAINT "calendar_event_grades_tenant_id_grade_level_descriptor_id__fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ADD CONSTRAINT "caption_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ADD CONSTRAINT "caption_drafts_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."caption_drafts" ADD CONSTRAINT "caption_drafts_tenant_id_requested_by_user_id_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_grades" ADD CONSTRAINT "class_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_grades" ADD CONSTRAINT "class_grades_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_grades" ADD CONSTRAINT "class_grades_tenant_id_grade_level_descriptor_id_grade_lev_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."class_grading" ADD CONSTRAINT "class_grading_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_grading" ADD CONSTRAINT "class_grading_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_grading" ADD CONSTRAINT "class_grading_tenant_id_programme_id_fkey" FOREIGN KEY ("tenant_id","programme_id") REFERENCES "core"."programmes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_grading" ADD CONSTRAINT "class_grading_tenant_id_grade_scale_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_id") REFERENCES "core"."grade_scales"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id","group_id") REFERENCES "core"."class_groups"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_group_members" ADD CONSTRAINT "class_group_members_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_groups" ADD CONSTRAINT "class_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_groups" ADD CONSTRAINT "class_groups_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_groups" ADD CONSTRAINT "class_groups_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_lesson_settings" ADD CONSTRAINT "class_lesson_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_lesson_settings" ADD CONSTRAINT "class_lesson_settings_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_timetable_id_org_id_fkey" FOREIGN KEY ("tenant_id","timetable_id","org_id") REFERENCES "core"."timetables"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_class_period_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_period_id","org_id") REFERENCES "core"."class_periods"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_teacher_user_id_fkey" FOREIGN KEY ("tenant_id","teacher_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_meetings" ADD CONSTRAINT "class_meetings_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_tenant_id_bell_schedule_id_org_id_fkey" FOREIGN KEY ("tenant_id","bell_schedule_id","org_id") REFERENCES "core"."bell_schedules"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_running_grades" ADD CONSTRAINT "class_running_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_running_grades" ADD CONSTRAINT "class_running_grades_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_years" ADD CONSTRAINT "class_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_years" ADD CONSTRAINT "class_years_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_years" ADD CONSTRAINT "class_years_tenant_id_school_year_id_school_year_type_scho_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_course_id_org_id_fkey" FOREIGN KEY ("tenant_id","course_id","org_id") REFERENCES "core"."courses"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_subject_descriptor_id_subject_ns_fkey" FOREIGN KEY ("tenant_id","subject_descriptor_id","subject_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_guardians" ADD CONSTRAINT "consent_guardians_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."consent_guardians" ADD CONSTRAINT "consent_guardians_tenant_id_consent_record_id_fkey" FOREIGN KEY ("tenant_id","consent_record_id") REFERENCES "core"."consent_records"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_guardians" ADD CONSTRAINT "consent_guardians_tenant_id_relationship_id_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "core"."user_relationships"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_purpose_descriptor_id_purpose_ns_fkey" FOREIGN KEY ("tenant_id","purpose_descriptor_id","purpose_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_notice_id_fkey" FOREIGN KEY ("tenant_id","notice_id") REFERENCES "core"."privacy_notices"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_given_by_user_id_fkey" FOREIGN KEY ("tenant_id","given_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_evidence_file_id_fkey" FOREIGN KEY ("tenant_id","evidence_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."contact_changes" ADD CONSTRAINT "contact_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "health"."contact_changes" ADD CONSTRAINT "contact_changes_tenant_id_change_id_fkey" FOREIGN KEY ("tenant_id","change_id") REFERENCES "health"."requested_changes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."contact_changes" ADD CONSTRAINT "contact_changes_tenant_id_relationship_id_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "core"."user_relationships"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."courses" ADD CONSTRAINT "courses_tenant_id_subject_descriptor_id_subject_ns_fkey" FOREIGN KEY ("tenant_id","subject_descriptor_id","subject_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."demographics" ADD CONSTRAINT "demographics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."demographics" ADD CONSTRAINT "demographics_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."demographics" ADD CONSTRAINT "demographics_tenant_id_religion_descriptor_id_religion_ns_fkey" FOREIGN KEY ("tenant_id","religion_descriptor_id","religion_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."descriptor_overrides" ADD CONSTRAINT "descriptor_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."descriptor_overrides" ADD CONSTRAINT "descriptor_overrides_tenant_id_descriptor_id_fkey" FOREIGN KEY ("tenant_id","descriptor_id") REFERENCES "core"."descriptors"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."descriptor_overrides" ADD CONSTRAINT "descriptor_overrides_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."descriptors" ADD CONSTRAINT "descriptors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."descriptors" ADD CONSTRAINT "descriptors_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."descriptors" ADD CONSTRAINT "descriptors_tenant_id_prior_descriptor_id_namespace_fkey" FOREIGN KEY ("tenant_id","prior_descriptor_id","namespace") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."devices" ADD CONSTRAINT "devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."devices" ADD CONSTRAINT "devices_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."devices" ADD CONSTRAINT "devices_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ADD CONSTRAINT "discussion_likes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ADD CONSTRAINT "discussion_likes_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."discussion_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ADD CONSTRAINT "discussion_likes_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_parent_post_id_fkey" FOREIGN KEY ("tenant_id","parent_post_id") REFERENCES "core"."discussion_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_hidden_by_user_id_fkey" FOREIGN KEY ("tenant_id","hidden_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_comments" ADD CONSTRAINT "document_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_comments" ADD CONSTRAINT "document_comments_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."document_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_comments" ADD CONSTRAINT "document_comments_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_files" ADD CONSTRAINT "document_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_files" ADD CONSTRAINT "document_files_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_files" ADD CONSTRAINT "document_files_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."document_holds" ADD CONSTRAINT "document_holds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_holds" ADD CONSTRAINT "document_holds_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_links" ADD CONSTRAINT "document_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_links" ADD CONSTRAINT "document_links_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_subject_descriptor_id_subject_fkey" FOREIGN KEY ("tenant_id","subject_descriptor_id","subject_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_tenant_id_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_resolved_by_user_id_fkey" FOREIGN KEY ("tenant_id","resolved_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_translations" ADD CONSTRAINT "document_translations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_translations" ADD CONSTRAINT "document_translations_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_translations" ADD CONSTRAINT "document_translations_tenant_id_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_versions" ADD CONSTRAINT "document_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_versions" ADD CONSTRAINT "document_versions_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_versions" ADD CONSTRAINT "document_versions_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."documents" ADD CONSTRAINT "documents_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."documents" ADD CONSTRAINT "documents_tenant_id_translation_of_id_fkey" FOREIGN KEY ("tenant_id","translation_of_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."documents" ADD CONSTRAINT "documents_tenant_id_last_edited_by_user_id_fkey" FOREIGN KEY ("tenant_id","last_edited_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."emergency_contacts" ADD CONSTRAINT "emergency_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."emergency_contacts" ADD CONSTRAINT "emergency_contacts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_classroom_position_descriptor_id_cla_fkey" FOREIGN KEY ("tenant_id","classroom_position_descriptor_id","classroom_position_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_subject_contact_id_fkey" FOREIGN KEY ("tenant_id","subject_contact_id") REFERENCES "core"."message_contacts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_approved_by_user_id_fkey" FOREIGN KEY ("tenant_id","approved_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_second_approver_user_id_fkey" FOREIGN KEY ("tenant_id","second_approver_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_items" ADD CONSTRAINT "erasure_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."erasure_items" ADD CONSTRAINT "erasure_items_tenant_id_approval_id_fkey" FOREIGN KEY ("tenant_id","approval_id") REFERENCES "core"."erasure_approvals"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_system_descriptor_id_system_ns_syst_fkey" FOREIGN KEY ("tenant_id","system_descriptor_id","system_ns","system_meaning") REFERENCES "core"."descriptors"("tenant_id","id","namespace","system_meaning");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_assigning_org_id_fkey" FOREIGN KEY ("tenant_id","assigning_org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."family_shares" ADD CONSTRAINT "family_shares_tenant_id_shared_by_user_id_fkey" FOREIGN KEY ("tenant_id","shared_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."federated_identities" ADD CONSTRAINT "federated_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."federated_identities" ADD CONSTRAINT "federated_identities_tenant_id_login_identity_id_fkey" FOREIGN KEY ("tenant_id","login_identity_id") REFERENCES "core"."login_identities"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."federated_identities" ADD CONSTRAINT "federated_identities_tenant_id_identity_provider_id_fkey" FOREIGN KEY ("tenant_id","identity_provider_id") REFERENCES "core"."identity_providers"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."file_previews" ADD CONSTRAINT "file_previews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."file_publications" ADD CONSTRAINT "file_publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."file_publications" ADD CONSTRAINT "file_publications_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_tagged_by_user_id_fkey" FOREIGN KEY ("tenant_id","tagged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_uploaded_by_user_id_fkey" FOREIGN KEY ("tenant_id","uploaded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_folder_id_fkey" FOREIGN KEY ("tenant_id","folder_id") REFERENCES "core"."media_folders"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_sitting_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","sitting_id","student_user_id") REFERENCES "core"."standard_sittings"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."goal_judgements" ADD CONSTRAINT "goal_judgements_tenant_id_judged_by_user_id_fkey" FOREIGN KEY ("tenant_id","judged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_framework_id_fkey" FOREIGN KEY ("tenant_id","framework_id") REFERENCES "core"."standard_frameworks"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."goal_reports" ADD CONSTRAINT "goal_reports_tenant_id_shared_by_user_id_fkey" FOREIGN KEY ("tenant_id","shared_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."grade_level_settings" ADD CONSTRAINT "grade_level_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."grade_level_settings" ADD CONSTRAINT "grade_level_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ADD CONSTRAINT "grade_scale_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ADD CONSTRAINT "grade_scale_versions_tenant_id_scale_id_fkey" FOREIGN KEY ("tenant_id","scale_id") REFERENCES "core"."grade_scales"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."grade_scale_versions" ADD CONSTRAINT "grade_scale_versions_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."gradebook_settings" ADD CONSTRAINT "gradebook_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."gradebook_settings" ADD CONSTRAINT "gradebook_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "core"."records_requests"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_requested_by_user_id_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_kind_descriptor_id_kind_ns_fkey" FOREIGN KEY ("tenant_id","kind_descriptor_id","kind_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_record_id_fkey" FOREIGN KEY ("tenant_id","record_id") REFERENCES "health"."records"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_kind_descriptor_id_kind_ns_fkey" FOREIGN KEY ("tenant_id","kind_descriptor_id","kind_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."homeroom_classes" ADD CONSTRAINT "homeroom_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."homeroom_classes" ADD CONSTRAINT "homeroom_classes_tenant_id_homeroom_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","homeroom_class_id","org_id") REFERENCES "core"."homerooms"("tenant_id","class_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."homeroom_classes" ADD CONSTRAINT "homeroom_classes_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."homeroom_members" ADD CONSTRAINT "homeroom_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."homeroom_members" ADD CONSTRAINT "homeroom_members_tenant_id_homeroom_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","homeroom_class_id","org_id") REFERENCES "core"."homerooms"("tenant_id","class_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."homeroom_members" ADD CONSTRAINT "homeroom_members_tenant_id_enrollment_id_homeroom_class_id_fkey" FOREIGN KEY ("tenant_id","enrollment_id","homeroom_class_id","student_user_id","org_id","valid_during","status") REFERENCES "core"."enrollments"("tenant_id","id","class_id","user_id","org_id","valid_during","status") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."homerooms" ADD CONSTRAINT "homerooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."homerooms" ADD CONSTRAINT "homerooms_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."identity_provider_orgs" ADD CONSTRAINT "identity_provider_orgs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."identity_provider_orgs" ADD CONSTRAINT "identity_provider_orgs_tenant_id_identity_provider_id_fkey" FOREIGN KEY ("tenant_id","identity_provider_id") REFERENCES "core"."identity_providers"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."identity_provider_orgs" ADD CONSTRAINT "identity_provider_orgs_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."identity_providers" ADD CONSTRAINT "identity_providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."import_rows" ADD CONSTRAINT "import_rows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."import_rows" ADD CONSTRAINT "import_rows_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."import_runs" ADD CONSTRAINT "import_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."import_runs" ADD CONSTRAINT "import_runs_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."import_runs" ADD CONSTRAINT "import_runs_tenant_id_source_file_id_source_file_purpose_fkey" FOREIGN KEY ("tenant_id","source_file_id","source_file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."import_runs" ADD CONSTRAINT "import_runs_tenant_id_started_by_user_id_fkey" FOREIGN KEY ("tenant_id","started_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."intake_grades" ADD CONSTRAINT "intake_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."intake_grades" ADD CONSTRAINT "intake_grades_tenant_id_intake_id_fkey" FOREIGN KEY ("tenant_id","intake_id") REFERENCES "core"."admission_intakes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."intake_grades" ADD CONSTRAINT "intake_grades_tenant_id_grade_level_descriptor_id_grade_le_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."intake_years" ADD CONSTRAINT "intake_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."intake_years" ADD CONSTRAINT "intake_years_tenant_id_intake_id_org_id_fkey" FOREIGN KEY ("tenant_id","intake_id","org_id") REFERENCES "core"."admission_intakes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."intake_years" ADD CONSTRAINT "intake_years_tenant_id_school_year_id_school_year_type_sch_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_prerequisite_module_id_fkey" FOREIGN KEY ("tenant_id","prerequisite_module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_placed_by_user_id_fkey" FOREIGN KEY ("tenant_id","placed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_released_by_user_id_fkey" FOREIGN KEY ("tenant_id","released_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_class_period_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_period_id","org_id") REFERENCES "core"."class_periods"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_cover_user_id_fkey" FOREIGN KEY ("tenant_id","cover_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_changes" ADD CONSTRAINT "lesson_changes_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ADD CONSTRAINT "lesson_code_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ADD CONSTRAINT "lesson_code_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_code" ADD CONSTRAINT "lesson_code_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_openings" ADD CONSTRAINT "lesson_openings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_openings" ADD CONSTRAINT "lesson_openings_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_openings" ADD CONSTRAINT "lesson_openings_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_openings" ADD CONSTRAINT "lesson_openings_tenant_id_opened_by_user_id_fkey" FOREIGN KEY ("tenant_id","opened_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD CONSTRAINT "lesson_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD CONSTRAINT "lesson_progress_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" ADD CONSTRAINT "lesson_progress_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ADD CONSTRAINT "lesson_projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ADD CONSTRAINT "lesson_projects_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ADD CONSTRAINT "lesson_projects_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_projects" ADD CONSTRAINT "lesson_projects_tenant_id_remixed_from_user_id_fkey" FOREIGN KEY ("tenant_id","remixed_from_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_released_by_user_id_fkey" FOREIGN KEY ("tenant_id","released_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_document_version_id_fkey" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "core"."document_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_marked_by_user_id_fkey" FOREIGN KEY ("tenant_id","marked_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ADD CONSTRAINT "lesson_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ADD CONSTRAINT "lesson_runs_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_runs" ADD CONSTRAINT "lesson_runs_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_shares" ADD CONSTRAINT "lesson_shares_tenant_id_decided_by_user_id_fkey" FOREIGN KEY ("tenant_id","decided_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_sittings" ADD CONSTRAINT "lesson_sittings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_sittings" ADD CONSTRAINT "lesson_sittings_tenant_id_sitting_id_student_user_id_kind_fkey" FOREIGN KEY ("tenant_id","sitting_id","student_user_id","kind") REFERENCES "core"."standard_sittings"("tenant_id","id","student_user_id","kind");--> statement-breakpoint
ALTER TABLE "core"."lesson_sittings" ADD CONSTRAINT "lesson_sittings_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_watches" ADD CONSTRAINT "lesson_watches_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_condition_lesson_id_fkey" FOREIGN KEY ("tenant_id","condition_lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_tenant_id_parent_location_id_fkey" FOREIGN KEY ("tenant_id","parent_location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_linked_by_user_id_fkey" FOREIGN KEY ("tenant_id","linked_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_folders" ADD CONSTRAINT "media_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_folders" ADD CONSTRAINT "media_folders_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_folders" ADD CONSTRAINT "media_folders_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "core"."media_folders"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_tag_id_fkey" FOREIGN KEY ("tenant_id","tag_id") REFERENCES "core"."media_tags"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_tags" ADD CONSTRAINT "media_item_tags_tenant_id_tagged_by_user_id_fkey" FOREIGN KEY ("tenant_id","tagged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_item_texts" ADD CONSTRAINT "media_item_texts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_item_texts" ADD CONSTRAINT "media_item_texts_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."media_tags" ADD CONSTRAINT "media_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."media_tags" ADD CONSTRAINT "media_tags_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD CONSTRAINT "message_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD CONSTRAINT "message_contacts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD CONSTRAINT "message_contacts_tenant_id_merged_into_id_fkey" FOREIGN KEY ("tenant_id","merged_into_id") REFERENCES "core"."message_contacts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_tenant_id_author_contact_id_fkey" FOREIGN KEY ("tenant_id","author_contact_id") REFERENCES "core"."message_contacts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id","group_id") REFERENCES "core"."class_groups"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_audiences" ADD CONSTRAINT "module_audiences_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_discussions" ADD CONSTRAINT "module_discussions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."module_discussions" ADD CONSTRAINT "module_discussions_tenant_id_assignment_id_class_id_status_fkey" FOREIGN KEY ("tenant_id","assignment_id","class_id","status") REFERENCES "core"."assignments"("tenant_id","id","class_id","status") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."module_discussions" ADD CONSTRAINT "module_discussions_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_templates" ADD CONSTRAINT "module_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."module_templates" ADD CONSTRAINT "module_templates_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id","template_id") REFERENCES "core"."document_templates"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."module_templates" ADD CONSTRAINT "module_templates_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."org_features" ADD CONSTRAINT "org_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."org_features" ADD CONSTRAINT "org_features_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_tenant_id_parent_id_parent_type_fkey" FOREIGN KEY ("tenant_id","parent_id","parent_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_tenant_id_logo_file_id_fkey" FOREIGN KEY ("tenant_id","logo_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_started_by_user_id_fkey" FOREIGN KEY ("tenant_id","started_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_shown_student_id_fkey" FOREIGN KEY ("tenant_id","shown_student_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."passkeys" ADD CONSTRAINT "passkeys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."passkeys" ADD CONSTRAINT "passkeys_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_review_comments" ADD CONSTRAINT "peer_review_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."peer_review_comments" ADD CONSTRAINT "peer_review_comments_tenant_id_review_id_fkey" FOREIGN KEY ("tenant_id","review_id") REFERENCES "core"."peer_reviews"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_review_settings" ADD CONSTRAINT "peer_review_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."peer_review_settings" ADD CONSTRAINT "peer_review_settings_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_reviewer_user_id_fkey" FOREIGN KEY ("tenant_id","reviewer_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_hidden_by_user_id_fkey" FOREIGN KEY ("tenant_id","hidden_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_grading_period_id_fkey" FOREIGN KEY ("tenant_id","grading_period_id") REFERENCES "core"."academic_sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."period_grades" ADD CONSTRAINT "period_grades_tenant_id_grade_scale_version_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_version_id") REFERENCES "core"."grade_scale_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_purpose_descriptor_id_purpose_ns_fkey" FOREIGN KEY ("tenant_id","purpose_descriptor_id","purpose_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_supersedes_id_fkey" FOREIGN KEY ("tenant_id","supersedes_id") REFERENCES "core"."privacy_notices"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_document_version_id_fkey" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "core"."document_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."program_remarks" ADD CONSTRAINT "program_remarks_tenant_id_requested_by_user_id_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programme_categories" ADD CONSTRAINT "programme_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."programme_categories" ADD CONSTRAINT "programme_categories_tenant_id_programme_id_fkey" FOREIGN KEY ("tenant_id","programme_id") REFERENCES "core"."programmes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ADD CONSTRAINT "programme_grade_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ADD CONSTRAINT "programme_grade_levels_tenant_id_programme_id_fkey" FOREIGN KEY ("tenant_id","programme_id") REFERENCES "core"."programmes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programme_grade_levels" ADD CONSTRAINT "programme_grade_levels_tenant_id_grade_level_descriptor_id_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."programmes" ADD CONSTRAINT "programmes_tenant_id_grade_scale_id_fkey" FOREIGN KEY ("tenant_id","grade_scale_id") REFERENCES "core"."grade_scales"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_tenant_id_marked_by_user_id_fkey" FOREIGN KEY ("tenant_id","marked_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."quiz_draws" ADD CONSTRAINT "quiz_draws_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_draws" ADD CONSTRAINT "quiz_draws_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD CONSTRAINT "quiz_sittings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."quiz_sittings" ADD CONSTRAINT "quiz_sittings_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."reading_norms" ADD CONSTRAINT "reading_norms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."reading_norms" ADD CONSTRAINT "reading_norms_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_closed_by_user_id_fkey" FOREIGN KEY ("tenant_id","closed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_tenant_id_logged_by_user_id_fkey" FOREIGN KEY ("tenant_id","logged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."register_periods" ADD CONSTRAINT "register_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."register_periods" ADD CONSTRAINT "register_periods_tenant_id_register_id_class_id_taken_on_fkey" FOREIGN KEY ("tenant_id","register_id","class_id","taken_on") REFERENCES "core"."attendance_registers"("tenant_id","id","class_id","taken_on");--> statement-breakpoint
ALTER TABLE "core"."register_periods" ADD CONSTRAINT "register_periods_tenant_id_class_period_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_period_id","org_id") REFERENCES "core"."class_periods"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_relationship_id_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "core"."user_relationships"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_court_order_file_id_co_fkey" FOREIGN KEY ("tenant_id","court_order_file_id","court_order_file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_verification_file_id_v_fkey" FOREIGN KEY ("tenant_id","verification_file_id","verification_file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ADD CONSTRAINT "retention_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."retention_settings" ADD CONSTRAINT "retention_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."rubrics" ADD CONSTRAINT "rubrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."rubrics" ADD CONSTRAINT "rubrics_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."saved_views" ADD CONSTRAINT "saved_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."saved_views" ADD CONSTRAINT "saved_views_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."saved_views" ADD CONSTRAINT "saved_views_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "audit"."seal_batches" ADD CONSTRAINT "seal_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "audit"."seal_members" ADD CONSTRAINT "seal_members_tenant_id_batch_no_fkey" FOREIGN KEY ("tenant_id","batch_no") REFERENCES "audit"."seal_batches"("tenant_id","batch_no");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_login_identity_id_fkey" FOREIGN KEY ("tenant_id","login_identity_id") REFERENCES "core"."login_identities"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_passkey_id_fkey" FOREIGN KEY ("tenant_id","passkey_id") REFERENCES "core"."passkeys"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_active_org_id_fkey" FOREIGN KEY ("tenant_id","active_org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id","device_id") REFERENCES "core"."devices"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_tenant_id_replaced_by_session_id_fkey" FOREIGN KEY ("tenant_id","replaced_by_session_id") REFERENCES "core"."sessions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ADD CONSTRAINT "shared_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ADD CONSTRAINT "shared_blocks_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."shared_blocks" ADD CONSTRAINT "shared_blocks_tenant_id_owner_user_id_fkey" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_categories" ADD CONSTRAINT "site_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_categories" ADD CONSTRAINT "site_categories_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_classes" ADD CONSTRAINT "site_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_classes" ADD CONSTRAINT "site_classes_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_classes" ADD CONSTRAINT "site_classes_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."site_classes" ADD CONSTRAINT "site_classes_tenant_id_picture_file_id_fkey" FOREIGN KEY ("tenant_id","picture_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_handled_by_fkey" FOREIGN KEY ("tenant_id","handled_by") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_assignee_user_id_fkey" FOREIGN KEY ("tenant_id","assignee_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_enquirer_user_id_fkey" FOREIGN KEY ("tenant_id","enquirer_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_applicant_user_id_fkey" FOREIGN KEY ("tenant_id","applicant_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "core"."site_pages"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_pages" ADD CONSTRAINT "site_pages_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_broadcast_id_fkey" FOREIGN KEY ("tenant_id","broadcast_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_posts" ADD CONSTRAINT "site_posts_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."site_categories"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_tenant_id_page_id_fkey" FOREIGN KEY ("tenant_id","page_id") REFERENCES "core"."site_pages"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_pages" ADD CONSTRAINT "site_published_pages_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."broadcasts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_published_posts" ADD CONSTRAINT "site_published_posts_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "core"."site_categories"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_to_page_id_fkey" FOREIGN KEY ("tenant_id","to_page_id") REFERENCES "core"."site_pages"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_redirects" ADD CONSTRAINT "site_redirects_tenant_id_created_by_user_id_fkey" FOREIGN KEY ("tenant_id","created_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD CONSTRAINT "site_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."site_settings" ADD CONSTRAINT "site_settings_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ADD CONSTRAINT "staff_absences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ADD CONSTRAINT "staff_absences_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."staff_absences" ADD CONSTRAINT "staff_absences_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_evidence" ADD CONSTRAINT "standard_evidence_tenant_id_sitting_id_student_user_id_sit_fkey" FOREIGN KEY ("tenant_id","sitting_id","student_user_id","sitting_kind") REFERENCES "core"."standard_sittings"("tenant_id","id","student_user_id","kind");--> statement-breakpoint
ALTER TABLE "core"."standard_frameworks" ADD CONSTRAINT "standard_frameworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_frameworks" ADD CONSTRAINT "standard_frameworks_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_observed_by_user_id_fkey" FOREIGN KEY ("tenant_id","observed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_sittings" ADD CONSTRAINT "standard_sittings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_sittings" ADD CONSTRAINT "standard_sittings_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standards" ADD CONSTRAINT "standards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standards" ADD CONSTRAINT "standards_tenant_id_framework_id_fkey" FOREIGN KEY ("tenant_id","framework_id") REFERENCES "core"."standard_frameworks"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standards" ADD CONSTRAINT "standards_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_departures" ADD CONSTRAINT "student_departures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."student_departures" ADD CONSTRAINT "student_departures_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."student_departures" ADD CONSTRAINT "student_departures_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_grades" ADD CONSTRAINT "student_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."student_grades" ADD CONSTRAINT "student_grades_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_grades" ADD CONSTRAINT "student_grades_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_grades" ADD CONSTRAINT "student_grades_tenant_id_grade_level_descriptor_id_grade_l_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_grades" ADD CONSTRAINT "student_grades_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_reason_descriptor_id_reason_ns_fkey" FOREIGN KEY ("tenant_id","reason_descriptor_id","reason_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_collected_by_user_id_fkey" FOREIGN KEY ("tenant_id","collected_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_school_year_id_school_year__fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_entry_type_descriptor_id_en_fkey" FOREIGN KEY ("tenant_id","entry_type_descriptor_id","entry_type_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_exit_type_descriptor_id_exi_fkey" FOREIGN KEY ("tenant_id","exit_type_descriptor_id","exit_type_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_intention_by_user_id_fkey" FOREIGN KEY ("tenant_id","intention_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ADD CONSTRAINT "submission_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ADD CONSTRAINT "submission_attempts_tenant_id_submission_id_student_user_i_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."submission_attempts" ADD CONSTRAINT "submission_attempts_tenant_id_submitted_by_user_id_fkey" FOREIGN KEY ("tenant_id","submitted_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."submissions" ADD CONSTRAINT "submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."submissions" ADD CONSTRAINT "submissions_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."submissions" ADD CONSTRAINT "submissions_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."tenant_keys" ADD CONSTRAINT "tenant_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_tenant_id_contact_id_fkey" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "core"."message_contacts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."timetable_days" ADD CONSTRAINT "timetable_days_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."timetable_days" ADD CONSTRAINT "timetable_days_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."timetable_days" ADD CONSTRAINT "timetable_days_tenant_id_bell_schedule_id_org_id_fkey" FOREIGN KEY ("tenant_id","bell_schedule_id","org_id") REFERENCES "core"."bell_schedules"("tenant_id","id","org_id");--> statement-breakpoint
ALTER TABLE "core"."timetables" ADD CONSTRAINT "timetables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."timetables" ADD CONSTRAINT "timetables_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_preferences" ADD CONSTRAINT "user_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."user_preferences" ADD CONSTRAINT "user_preferences_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ADD CONSTRAINT "user_relationships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ADD CONSTRAINT "user_relationships_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ADD CONSTRAINT "user_relationships_tenant_id_related_user_id_fkey" FOREIGN KEY ("tenant_id","related_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ADD CONSTRAINT "user_relationships_tenant_id_relation_descriptor_id_relati_fkey" FOREIGN KEY ("tenant_id","relation_descriptor_id","relation_ns","relation_meaning") REFERENCES "core"."descriptors"("tenant_id","id","namespace","system_meaning");--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ADD CONSTRAINT "user_relationships_tenant_id_verified_by_user_id_fkey" FOREIGN KEY ("tenant_id","verified_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_relationships" ADD CONSTRAINT "user_relationships_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_position_descriptor_id_position_ns_fkey" FOREIGN KEY ("tenant_id","position_descriptor_id","position_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_photo_file_id_fkey" FOREIGN KEY ("tenant_id","photo_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_primary_org_id_fkey" FOREIGN KEY ("tenant_id","primary_org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_sex_descriptor_id_sex_ns_fkey" FOREIGN KEY ("tenant_id","sex_descriptor_id","sex_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ADD CONSTRAINT "work_comment_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ADD CONSTRAINT "work_comment_answers_tenant_id_comment_id_fkey" FOREIGN KEY ("tenant_id","comment_id") REFERENCES "core"."work_comments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_answers" ADD CONSTRAINT "work_comment_answers_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ADD CONSTRAINT "work_comment_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ADD CONSTRAINT "work_comment_replies_tenant_id_comment_id_fkey" FOREIGN KEY ("tenant_id","comment_id") REFERENCES "core"."work_comments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comment_replies" ADD CONSTRAINT "work_comment_replies_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD CONSTRAINT "work_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD CONSTRAINT "work_comments_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD CONSTRAINT "work_comments_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD CONSTRAINT "work_comments_tenant_id_bank_comment_id_fkey" FOREIGN KEY ("tenant_id","bank_comment_id") REFERENCES "core"."bank_comments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."work_sittings" ADD CONSTRAINT "work_sittings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."work_sittings" ADD CONSTRAINT "work_sittings_tenant_id_sitting_id_student_user_id_kind_fkey" FOREIGN KEY ("tenant_id","sitting_id","student_user_id","kind") REFERENCES "core"."standard_sittings"("tenant_id","id","student_user_id","kind");--> statement-breakpoint
ALTER TABLE "core"."work_sittings" ADD CONSTRAINT "work_sittings_tenant_id_submission_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","submission_id","student_user_id") REFERENCES "core"."submissions"("tenant_id","id","student_user_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_source_year_id_source_year_fkey_source" FOREIGN KEY ("tenant_id","source_year_id","source_year_type","source_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_target_year_id_target_year_fkey_target" FOREIGN KEY ("tenant_id","target_year_id","target_year_type","target_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."year_rollovers" ADD CONSTRAINT "year_rollovers_tenant_id_applied_by_user_id_fkey" FOREIGN KEY ("tenant_id","applied_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."young_classes" ADD CONSTRAINT "young_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."young_classes" ADD CONSTRAINT "young_classes_tenant_id_class_id_org_id_fkey" FOREIGN KEY ("tenant_id","class_id","org_id") REFERENCES "core"."classes"("tenant_id","id","org_id");--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."absence_reports" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id") or app.erasure_approved(tenant_id, "reported_by_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."absence_reports" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id") or app.erasure_approved(tenant_id, "reported_by_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."absence_reports" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."absence_reports" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."absence_reports" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."absence_reports" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."absence_reports" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."academic_sessions" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and type = 'school_year');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."academic_sessions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."academic_sessions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."academic_sessions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."academic_sessions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."academic_sessions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."academic_sessions" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."academic_weeks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."academic_weeks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."academic_weeks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."academic_weeks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."academic_weeks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."academic_weeks" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."access_arrangements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."access_arrangements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."access_arrangements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."access_arrangements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."access_arrangements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."access_arrangements" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."access_arrangements" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."access_role_assignments" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."access_role_assignments" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."access_role_assignments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."access_role_assignments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."access_role_assignments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."access_role_assignments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."access_role_assignments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."access_roles" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."access_roles" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."access_roles" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."access_roles" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."access_roles" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."accounts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."accounts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."accounts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."accounts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."accounts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."accounts" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."accounts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "core"."admission_events" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_events" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_events" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_events" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_events" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."admission_events" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.admission_applications a
        where a.tenant_id = admission_events.tenant_id and a.id = admission_events.application_id
          and app.erasure_approved(a.tenant_id, a.applicant_user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_form_versions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_form_versions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_form_versions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_form_versions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_forms" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_forms" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_forms" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_forms" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_forms" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."admission_intakes" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_intakes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_intakes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_intakes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_intakes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_intakes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_items" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_items" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_items" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_items" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."admission_items" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."admission_letters" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."admission_letters" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."admission_letters" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."admission_letters" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit"."anchors" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "audit"."anchors" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "audit"."anchors" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "audit"."anchors" AS PERMISSIVE FOR INSERT TO "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assessments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assessments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assessments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assessments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assessments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."assessments" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."assignment_recipients" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."assignment_recipients" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assignment_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assignment_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assignment_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assignment_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assignment_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assignment_terms" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assignment_terms" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assignment_terms" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assignment_terms" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assignment_terms" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assignments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assignments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assignments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assignments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assignments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."assignments" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assistant_requests" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assistant_requests" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assistant_requests" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assistant_requests" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assistant_requests" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."assistant_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."assistant_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."assistant_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."assistant_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."assistant_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attendance_registers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attendance_registers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attendance_registers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attendance_registers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attendance_registers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."attendance_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."attendance_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."attendance_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."attendance_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."attendance_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."auth_attempts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."auth_attempts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."auth_attempts" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."auth_attempts" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."auth_attempts" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."auth_attempts" AS PERMISSIVE FOR DELETE TO "retention" USING (window_ends_at < statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."bank_comments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."bank_comments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."bank_comments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."bank_comments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."bank_comments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."bank_questions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."bank_questions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."bank_questions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."bank_questions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."bank_questions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."bell_schedules" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."bell_schedules" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."bell_schedules" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."bell_schedules" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."bell_schedules" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."breaches" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."breaches" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."breaches" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."breaches" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."breaches" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcast_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcast_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcast_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcast_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcast_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcast_families" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcast_families" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcast_families" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcast_families" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcast_families" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcast_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcast_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcast_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcast_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcast_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."broadcast_recipients" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."broadcast_recipients" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcast_recipients" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcast_recipients" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcast_recipients" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcast_recipients" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcast_recipients" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."broadcasts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."broadcasts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."broadcasts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."broadcasts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."broadcasts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_dates" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_dates" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_dates" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_dates" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_dates" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."calendar_dates" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_event_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_event_families" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_event_families" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_event_families" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_event_families" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_event_families" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_event_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_event_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_event_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_event_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_event_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."calendar_events" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and public and state = 'published');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_events" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_events" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_events" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_events" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_events" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_feeds" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_feeds" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_feeds" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_feeds" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_feeds" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."calendar_feeds" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."calendar_feeds" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."caption_drafts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."caption_drafts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."caption_drafts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."caption_drafts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."caption_drafts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."class_grades" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_grading" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_grading" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_grading" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_grading" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_grading" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."class_group_members" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."class_group_members" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_group_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_group_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_group_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_group_members" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_group_members" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_groups" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_groups" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_groups" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_groups" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_groups" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_lesson_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_lesson_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_lesson_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_lesson_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_lesson_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_meetings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_meetings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_meetings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_meetings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_meetings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_periods" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_periods" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_periods" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_periods" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_periods" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."class_periods" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_running_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_running_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_running_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_running_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_running_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_years" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_years" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_years" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_years" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_years" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."class_years" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."classes" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."consent_guardians" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."consent_guardians" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."consent_guardians" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."consent_guardians" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."consent_records" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."consent_records" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."consent_records" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."consent_records" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "health"."contact_changes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "health"."contact_changes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "health"."contact_changes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "health"."contact_changes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "health"."contact_changes" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'health') WITH CHECK ((select current_setting('app.purpose', true)) = 'health');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "health"."contact_changes" AS PERMISSIVE FOR DELETE TO "retention" USING (exists (select 1 from health.requested_changes c where c.tenant_id = contact_changes.tenant_id and c.id = contact_changes.change_id and app.erasure_approved(c.tenant_id, c.student_user_id)));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."contact_points" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."contact_points" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."contact_points" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."contact_points" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."contact_points" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."contact_points" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."contact_points" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."contact_points" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."courses" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."courses" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."courses" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."courses" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."courses" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."courses" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."demographics" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."demographics" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."demographics" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."demographics" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."demographics" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."demographics" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "core"."demographics" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'demographics') WITH CHECK ((select current_setting('app.purpose', true)) = 'demographics');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."demographics" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."descriptor_overrides" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."descriptor_overrides" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."descriptor_overrides" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."descriptor_overrides" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."descriptor_overrides" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."descriptor_overrides" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."descriptor_overrides" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."descriptors" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and namespace = 'grade_level');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."descriptors" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."descriptors" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."descriptors" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."descriptors" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."descriptors" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."descriptors" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."devices" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."devices" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."devices" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."devices" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."devices" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."devices" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.accounts a where a.tenant_id = "devices".tenant_id and a.id = "devices".account_id and app.erasure_approved(a.tenant_id, a.user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."devices" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.accounts a where a.tenant_id = "devices".tenant_id and a.id = "devices".account_id and app.erasure_approved(a.tenant_id, a.user_id))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."discussion_likes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."discussion_likes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."discussion_likes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."discussion_likes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."discussion_likes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."discussion_likes" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."discussion_likes" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."discussion_posts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."discussion_posts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."discussion_posts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."discussion_posts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."discussion_posts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."discussion_posts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "author_user_id")) WITH CHECK (redacted_at is not null);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."document_comments" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "author_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."document_comments" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "author_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_comments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_comments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_comments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_comments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_comments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_files" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_files" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_files" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_files" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_files" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."document_files" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'document', "document_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."document_files" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_listed(tenant_id, 'document', "document_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_holds" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_holds" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_holds" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_holds" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_holds" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."document_holds" AS PERMISSIVE FOR DELETE TO "retention" USING (expires_at < statement_timestamp() or app.erasure_approved(tenant_id, "user_id"));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_links" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_links" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_links" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_links" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_links" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_templates" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_templates" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_templates" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_templates" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_templates" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_threads" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_threads" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_threads" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_threads" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_threads" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_translations" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_translations" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_translations" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_translations" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_translations" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."document_translations" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'document', "document_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_versions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_versions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_versions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_versions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_collab_select" ON "core"."document_versions" AS PERMISSIVE FOR SELECT TO "collab" USING (exists (select 1 from core.documents d where d.tenant_id = document_versions.tenant_id and d.id = document_versions.document_id and d.collaborative and d.frozen_at is null));--> statement-breakpoint
CREATE POLICY "p_collab_insert" ON "core"."document_versions" AS PERMISSIVE FOR INSERT TO "collab" WITH CHECK (reason = 'checkpoint' and exists (select 1 from core.documents d where d.tenant_id = document_versions.tenant_id and d.id = document_versions.document_id and d.collaborative and d.frozen_at is null));--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."document_versions" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'document', document_id)) WITH CHECK (redacted_at is not null);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."documents" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."documents" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."documents" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."documents" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."documents" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."documents" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'document', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_collab_select" ON "core"."documents" AS PERMISSIVE FOR SELECT TO "collab" USING (collaborative);--> statement-breakpoint
CREATE POLICY "p_collab_update" ON "core"."documents" AS PERMISSIVE FOR UPDATE TO "collab" USING (collaborative and frozen_at is null) WITH CHECK (collaborative);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."emergency_contacts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."emergency_contacts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."emergency_contacts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."emergency_contacts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."emergency_contacts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."emergency_contacts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."emergency_contacts" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."enrollments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."enrollments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."enrollments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."enrollments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."enrollments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."enrollments" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."enrollments" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."erasure_approvals" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."erasure_approvals" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."erasure_approvals" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."erasure_approvals" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."erasure_items" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."erasure_items" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."erasure_items" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."erasure_items" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."external_ids" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."external_ids" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."external_ids" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."external_ids" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."external_ids" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."external_ids" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."external_ids" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."external_ids" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."family_shares" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id") or app.erasure_approved(tenant_id, "shared_by_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."family_shares" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id") or app.erasure_approved(tenant_id, "shared_by_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."family_shares" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."family_shares" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."family_shares" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."family_shares" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."family_shares" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."federated_identities" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."federated_identities" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."federated_identities" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."federated_identities" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."federated_identities" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."federated_identities" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.login_identities l join core.accounts a on a.tenant_id = l.tenant_id and a.id = l.account_id where l.tenant_id = federated_identities.tenant_id and l.id = federated_identities.login_identity_id and app.erasure_approved(a.tenant_id, a.user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."federated_identities" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.login_identities l join core.accounts a on a.tenant_id = l.tenant_id and a.id = l.account_id where l.tenant_id = federated_identities.tenant_id and l.id = federated_identities.login_identity_id and app.erasure_approved(a.tenant_id, a.user_id))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."file_previews" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."file_previews" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."file_previews" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."file_previews" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."file_previews" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."file_publications" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."file_publications" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."file_publications" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."file_publications" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."file_publications" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."file_publications" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and unpublished_at is null);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."file_subjects" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."file_subjects" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."file_subjects" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."file_subjects" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."file_subjects" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."file_subjects" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."file_subjects" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."files" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."files" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."files" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."files" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."files" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."files" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'file', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."files" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_listed(tenant_id, 'file', "id")));--> statement-breakpoint
CREATE POLICY "files_purpose_gate" ON "core"."files" AS RESTRICTIVE FOR ALL TO public USING (purpose not in ('health_report', 'evidence', 'legal_document') or (select current_setting('app.purpose', true)) = case purpose when 'health_report' then 'health' else 'custody' end) WITH CHECK (purpose not in ('health_report', 'evidence', 'legal_document') or (select current_setting('app.purpose', true)) = case purpose when 'health_report' then 'health' else 'custody' end);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."goal_judgements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."goal_judgements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."goal_judgements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."goal_judgements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."goal_judgements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."goal_judgements" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."goal_judgements" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."goal_reports" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."goal_reports" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."goal_reports" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."goal_reports" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."goal_reports" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."goal_reports" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."goal_reports" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."grade_level_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."grade_level_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."grade_level_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."grade_level_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."grade_level_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."grade_scale_versions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."grade_scale_versions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."grade_scale_versions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."grade_scale_versions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."grade_scale_versions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."grade_scales" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."grade_scales" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."grade_scales" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."grade_scales" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."grade_scales" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."gradebook_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."gradebook_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."gradebook_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."gradebook_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."gradebook_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "health"."requested_changes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "health"."requested_changes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "health"."requested_changes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "health"."requested_changes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "health"."requested_changes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "health"."requested_changes" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'health') WITH CHECK ((select current_setting('app.purpose', true)) = 'health');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "health"."requested_changes" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "health"."requested_changes" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "health"."records" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "health"."records" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "health"."records" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "health"."records" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "health"."records" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "health"."records" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'health') WITH CHECK ((select current_setting('app.purpose', true)) = 'health');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "health"."records" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "health"."records" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."homeroom_classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."homeroom_classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."homeroom_classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."homeroom_classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."homeroom_classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."homeroom_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."homeroom_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."homeroom_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."homeroom_members" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."homeroom_members" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."homerooms" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."homerooms" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."homerooms" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."homerooms" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."homerooms" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."identity_provider_orgs" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."identity_provider_orgs" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."identity_provider_orgs" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."identity_provider_orgs" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."identity_provider_orgs" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."identity_providers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."identity_providers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."identity_providers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."identity_providers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."identity_providers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."import_rows" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."import_rows" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."import_rows" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."import_rows" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."import_runs" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."import_runs" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."import_runs" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."import_runs" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."import_runs" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."intake_grades" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."intake_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."intake_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."intake_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."intake_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."intake_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."intake_years" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."intake_years" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."intake_years" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."intake_years" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."intake_years" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."intake_years" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."learning_modules" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."learning_modules" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."learning_modules" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."learning_modules" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."learning_modules" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."legal_holds" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."legal_holds" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."legal_holds" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."legal_holds" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."legal_holds" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_changes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_changes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_changes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_changes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_changes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_code" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_code" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_code" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_code" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_code" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_code" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_code" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_openings" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_openings" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_openings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_openings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_openings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_openings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_openings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_progress" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_progress" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_progress" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_progress" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_progress" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_progress" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_progress" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_projects" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_projects" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_projects" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_projects" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_projects" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_projects" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_projects" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_releases" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_releases" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_releases" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_releases" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_releases" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_releases" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_releases" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_responses" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_responses" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_responses" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_responses" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_responses" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (redacted_at is not null);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_runs" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_runs" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_runs" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_runs" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_runs" AS PERMISSIVE FOR DELETE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id"));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_shares" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_shares" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_shares" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_shares" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_shares" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_shares" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_shares" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_sittings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_sittings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_sittings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_sittings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_sittings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_sittings" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_sittings" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."lesson_watches" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."lesson_watches" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_watches" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_watches" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_watches" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_watches" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lesson_watches" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lessons" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lessons" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lessons" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lessons" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."lessons" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."locations" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."locations" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."locations" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."locations" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."locations" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."login_identities" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."login_identities" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."login_identities" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."login_identities" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."login_identities" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."login_identities" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.accounts a where a.tenant_id = "login_identities".tenant_id and a.id = "login_identities".account_id and app.erasure_approved(a.tenant_id, a.user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."login_identities" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.accounts a where a.tenant_id = "login_identities".tenant_id and a.id = "login_identities".account_id and app.erasure_approved(a.tenant_id, a.user_id))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_folders" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_folders" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_folders" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_folders" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_folders" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_item_tags" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_item_tags" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_item_tags" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_item_tags" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_item_tags" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_item_texts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_item_texts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_item_texts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_item_texts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_item_texts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."media_tags" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."media_tags" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."media_tags" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."media_tags" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."media_tags" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."message_contacts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."message_contacts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."message_contacts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."message_contacts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."message_contacts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."message_contacts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "id") or app.erasure_approved(tenant_id, "user_id") or app.erasure_approved(tenant_id, "merged_into_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."message_drafts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."message_drafts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."message_drafts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."message_drafts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."message_drafts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."message_drafts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id") or app.erasure_approved(tenant_id, "student_user_id") or app.erasure_listed(tenant_id, 'message_thread', "thread_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."message_threads" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."message_threads" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."message_threads" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."message_threads" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."message_threads" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."message_threads" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'message_thread', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."messages" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."messages" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."messages" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."messages" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."messages" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."messages" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "author_user_id") or app.erasure_approved(tenant_id, "author_contact_id")
        or app.erasure_listed(tenant_id, 'message_thread', "thread_id")
        or exists (select 1 from core.message_contacts c where c.tenant_id = messages.tenant_id
          and c.id = messages.author_contact_id and app.erasure_approved(c.tenant_id, c.user_id))) WITH CHECK (redacted_at is not null);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."module_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."module_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."module_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."module_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."module_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."module_audiences" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."module_audiences" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."module_classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."module_classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."module_classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."module_classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."module_classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."module_discussions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."module_discussions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."module_discussions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."module_discussions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."module_discussions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."module_templates" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."module_templates" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."module_templates" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."module_templates" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."module_templates" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."org_features" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."org_features" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."org_features" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."org_features" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."org_features" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."orgs" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."orgs" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."orgs" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."orgs" AS PERMISSIVE FOR INSERT TO "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."orgs" AS PERMISSIVE FOR UPDATE TO "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_insert_app" ON "core"."orgs" AS PERMISSIVE FOR INSERT TO "app" WITH CHECK (type = 'department');--> statement-breakpoint
CREATE POLICY "p_update_app" ON "core"."orgs" AS PERMISSIVE FOR UPDATE TO "app" USING (true) WITH CHECK (type = 'department' or status = 'active');--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."orgs" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and lifecycle = 'active');--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."orgs" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."paced_lessons" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."paced_lessons" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."paced_lessons" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."paced_lessons" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."paced_lessons" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."passkeys" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."passkeys" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."passkeys" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."passkeys" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."passkeys" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."passkeys" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.accounts a where a.tenant_id = "passkeys".tenant_id and a.id = "passkeys".account_id and app.erasure_approved(a.tenant_id, a.user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."passkeys" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.accounts a where a.tenant_id = "passkeys".tenant_id and a.id = "passkeys".account_id and app.erasure_approved(a.tenant_id, a.user_id))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."peer_review_comments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."peer_review_comments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."peer_review_comments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."peer_review_comments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."peer_review_comments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."peer_review_comments" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.peer_reviews r where r.tenant_id = peer_review_comments.tenant_id and r.id = peer_review_comments.review_id and (app.erasure_approved(r.tenant_id, r.reviewer_user_id) or app.erasure_approved(r.tenant_id, r.author_user_id)))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."peer_review_comments" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.peer_reviews r where r.tenant_id = peer_review_comments.tenant_id and r.id = peer_review_comments.review_id and (app.erasure_approved(r.tenant_id, r.reviewer_user_id) or app.erasure_approved(r.tenant_id, r.author_user_id)))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."peer_review_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."peer_review_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."peer_review_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."peer_review_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."peer_review_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."peer_reviews" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."peer_reviews" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."peer_reviews" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."peer_reviews" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."peer_reviews" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."peer_reviews" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "reviewer_user_id") or app.erasure_approved(tenant_id, "author_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."peer_reviews" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "reviewer_user_id") or app.erasure_approved(tenant_id, "author_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."period_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."period_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."period_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."period_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."period_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."period_grades" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."privacy_notices" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."privacy_notices" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."privacy_notices" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."privacy_notices" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."privacy_notices" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."program_remarks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."program_remarks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."program_remarks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."program_remarks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."program_remarks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."programme_categories" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."programme_categories" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."programme_categories" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."programme_categories" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."programme_categories" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."programme_grade_levels" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."programme_grade_levels" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."programme_grade_levels" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."programme_grade_levels" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."programme_grade_levels" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."programmes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."programmes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."programmes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."programmes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."programmes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."quiz_answers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."quiz_answers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."quiz_answers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."quiz_answers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."quiz_answers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."quiz_answers" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."quiz_draws" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."quiz_draws" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."quiz_draws" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."quiz_draws" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."quiz_draws" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."quiz_draws" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."quiz_draws" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."quiz_sittings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."quiz_sittings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."quiz_sittings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."quiz_sittings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."quiz_sittings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."quiz_sittings" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."quiz_sittings" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."reading_norms" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."reading_norms" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."reading_norms" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."reading_norms" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."reading_norms" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."records_requests" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."records_requests" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."records_requests" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."records_requests" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."records_requests" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."register_periods" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."register_periods" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."register_periods" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."register_periods" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."register_periods" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."relationship_restrictions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."relationship_restrictions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."relationship_restrictions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."relationship_restrictions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."relationship_restrictions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "core"."relationship_restrictions" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'custody') WITH CHECK ((select current_setting('app.purpose', true)) = 'custody');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."relationship_restrictions" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.user_relationships r where r.tenant_id = relationship_restrictions.tenant_id and r.id = relationship_restrictions.relationship_id and (app.erasure_approved(r.tenant_id, r.student_user_id) or app.erasure_approved(r.tenant_id, r.related_user_id)))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."relationship_restrictions" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.user_relationships r where r.tenant_id = relationship_restrictions.tenant_id and r.id = relationship_restrictions.relationship_id and (app.erasure_approved(r.tenant_id, r.student_user_id) or app.erasure_approved(r.tenant_id, r.related_user_id)))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."retention_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."retention_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."retention_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."retention_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."retention_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."rubrics" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."rubrics" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."rubrics" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."rubrics" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."rubrics" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."saved_views" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."saved_views" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."saved_views" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."saved_views" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."saved_views" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."saved_views" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "owner_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."saved_views" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "owner_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit"."seal_batches" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "audit"."seal_batches" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "audit"."seal_batches" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "audit"."seal_batches" AS PERMISSIVE FOR INSERT TO "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit"."seal_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "audit"."seal_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "audit"."seal_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "audit"."seal_members" AS PERMISSIVE FOR INSERT TO "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."sessions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."sessions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."sessions" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."sessions" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."sessions" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."sessions" AS PERMISSIVE FOR DELETE TO "retention" USING (absolute_expires_at < statement_timestamp() - interval '30 days' or exists (select 1 from core.accounts a where a.tenant_id = "sessions".tenant_id and a.id = "sessions".account_id and app.erasure_approved(a.tenant_id, a.user_id)));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."shared_blocks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."shared_blocks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."shared_blocks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."shared_blocks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."shared_blocks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_categories" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_categories" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_categories" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_categories" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_categories" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_categories" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_enquiries" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_enquiries" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_enquiries" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_enquiries" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_enquiries" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."site_enquiries" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'site_enquiry', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_site_insert" ON "core"."site_enquiries" AS PERMISSIVE FOR INSERT TO "site" WITH CHECK (status = 'active' and source = 'website' and state = 'open'
        and closed_reason is null and assignee_user_id is null and first_responded_at is null
        and created_by_user_id is null and enquirer_user_id is null and applicant_user_id is null
        and thread_id is null and handled_at is null);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_enquiries" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and created_at > statement_timestamp() - interval '1 day');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_pages" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_pages" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_pages" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_pages" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_pages" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_posts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_posts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_posts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_posts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_posts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_published_pages" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_published_pages" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_published_pages" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_published_pages" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_published_pages" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_published_pages" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and visible_from <= statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_published_posts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_published_posts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_published_posts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_published_posts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_published_posts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_published_posts" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and visible_from <= statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_redirects" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_redirects" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_redirects" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_redirects" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_redirects" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_redirects" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."site_settings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."site_settings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."site_settings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."site_settings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."site_settings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."site_settings" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."staff_absences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."staff_absences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."staff_absences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."staff_absences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."staff_absences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_evidence" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_evidence" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_evidence" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_evidence" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_evidence" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."standard_evidence" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."standard_evidence" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_frameworks" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_frameworks" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_frameworks" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_frameworks" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_frameworks" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_observations" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_observations" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_observations" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_observations" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_observations" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."standard_observations" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."standard_observations" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_sittings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_sittings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_sittings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_sittings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_sittings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."standard_sittings" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."standard_sittings" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standards" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standards" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standards" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standards" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standards" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."student_departures" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."student_departures" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."student_departures" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."student_departures" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."student_departures" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."student_departures" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."student_grades" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."student_grades" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."student_grades" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."student_grades" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."student_grades" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."student_grades" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."student_grades" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."student_movements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."student_movements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."student_movements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."student_movements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."student_movements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."student_school_years" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."student_school_years" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."student_school_years" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."student_school_years" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."student_school_years" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."student_school_years" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."student_school_years" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."submission_attempts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."submission_attempts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."submission_attempts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."submission_attempts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."submission_attempts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."submissions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."submissions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."submissions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."submissions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."submissions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."tenant_keys" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."tenant_keys" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."tenant_keys" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."tenant_keys" AS PERMISSIVE FOR INSERT TO "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."tenant_keys" AS PERMISSIVE FOR UPDATE TO "retention", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."tenants" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."tenants" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."tenants" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."tenants" AS PERMISSIVE FOR INSERT TO "cell_io" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."tenants" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."tenants" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."thread_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."thread_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."thread_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."thread_members" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."thread_members" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."thread_members" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id") or app.erasure_approved(tenant_id, "contact_id") or app.erasure_listed(tenant_id, 'message_thread', "thread_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."timetable_days" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."timetable_days" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."timetable_days" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."timetable_days" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."timetable_days" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."timetables" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."timetables" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."timetables" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."timetables" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."timetables" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."user_preferences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."user_preferences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."user_preferences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."user_preferences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."user_preferences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."user_preferences" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."user_preferences" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."user_relationships" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."user_relationships" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."user_relationships" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."user_relationships" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."user_relationships" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."user_relationships" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."user_relationships" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, student_user_id) or app.erasure_approved(tenant_id, related_user_id)) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."user_roles" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."user_roles" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."user_roles" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."user_roles" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."user_roles" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."user_roles" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."user_roles" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."users" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."users" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."users" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."users" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."users" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."users" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."users" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."work_comment_answers" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."work_comment_answers" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."work_comment_answers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."work_comment_answers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."work_comment_answers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."work_comment_answers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."work_comment_answers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."work_comment_replies" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "author_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."work_comment_replies" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "author_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."work_comment_replies" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."work_comment_replies" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."work_comment_replies" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."work_comment_replies" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."work_comment_replies" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."work_comments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."work_comments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."work_comments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."work_comments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."work_comments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."work_sittings" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."work_sittings" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."work_sittings" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."work_sittings" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."work_sittings" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."work_sittings" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."work_sittings" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."year_rollovers" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."year_rollovers" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."year_rollovers" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."year_rollovers" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."year_rollovers" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."young_classes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."young_classes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."young_classes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."young_classes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."young_classes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);