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
	"sequence" smallint DEFAULT 1 NOT NULL,
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
	CONSTRAINT "access_roles_builtin_key_check" CHECK (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal', 'teacher', 'aide', 'counselor', 'proctor', 'staff', 'student', 'family')),
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
CREATE TABLE "core"."calendar_dates" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"calendar_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"day_on" date NOT NULL,
	"span" daterange GENERATED ALWAYS AS (daterange(day_on, day_on + 1, '[)')) STORED NOT NULL,
	"event_descriptor_id" uuid NOT NULL,
	"event_ns" text GENERATED ALWAYS AS ('calendar_event') STORED NOT NULL,
	"note_en" text,
	"note_ar" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_dates_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_dates_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_dates_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_dates_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_dates_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "calendar_dates_note_en_check" CHECK (char_length(note_en) between 1 and 200),
	CONSTRAINT "calendar_dates_note_ar_check" CHECK (char_length(note_ar) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_grade_levels" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"calendar_id" uuid NOT NULL,
	"grade_level_descriptor_id" uuid NOT NULL,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_grade_levels_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_grade_levels_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_grade_levels_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_grade_levels_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_grade_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendars" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"title_en" text,
	"title_ar" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendars_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendars_tenant_id_id_school_year_id_key" UNIQUE("tenant_id","id","school_year_id"),
	CONSTRAINT "calendars_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendars_version_check" CHECK (version > 0),
	CONSTRAINT "calendars_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendars_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "calendars_code_check" CHECK (code ~ '^[A-Za-z0-9_-]{1,60}$'),
	CONSTRAINT "calendars_kind_check" CHECK (kind in ('school', 'grade_level', 'staff')),
	CONSTRAINT "calendars_title_en_check" CHECK (char_length(title_en) between 1 and 80),
	CONSTRAINT "calendars_title_ar_check" CHECK (char_length(title_ar) between 1 and 80),
	CONSTRAINT "calendars_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."class_periods" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"code" text NOT NULL,
	"name_en" text,
	"name_ar" text,
	"sequence" smallint NOT NULL,
	"kind" text DEFAULT 'lesson' NOT NULL,
	"start_time" time,
	"end_time" time,
	"official_attendance" boolean DEFAULT false NOT NULL,
	"valid_during" daterange NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "class_periods_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "class_periods_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "class_periods_version_check" CHECK (version > 0),
	CONSTRAINT "class_periods_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "class_periods_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "class_periods_code_check" CHECK (code ~ '^[A-Za-z0-9_-]{1,20}$'),
	CONSTRAINT "class_periods_name_en_check" CHECK (char_length(name_en) between 1 and 60),
	CONSTRAINT "class_periods_name_ar_check" CHECK (char_length(name_ar) between 1 and 60),
	CONSTRAINT "class_periods_sequence_check" CHECK (sequence between 1 and 50),
	CONSTRAINT "class_periods_kind_check" CHECK (kind in ('lesson', 'registration', 'break', 'other')),
	CONSTRAINT "class_periods_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "class_periods_times_check" CHECK ((start_time is null) = (end_time is null) and (end_time is null or end_time > start_time)),
	CONSTRAINT "class_periods_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and not upper_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."class_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"relationship_id" uuid,
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
	CONSTRAINT "consent_records_guardian_check" CHECK (capacity <> 'guardian' or (relationship_id is not null and given_by_user_id is not null)),
	CONSTRAINT "consent_records_self_check" CHECK (capacity <> 'self' or given_by_user_id = subject_user_id),
	CONSTRAINT "consent_records_notice_check" CHECK (method = 'import' or decision = 'withdrawn' or notice_id is not null),
	CONSTRAINT "consent_records_valid_during_check" CHECK (not isempty(valid_during) and not lower_inf(valid_during))
);
--> statement-breakpoint
ALTER TABLE "core"."consent_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."contact_points" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"user_id" uuid,
	"household_id" uuid,
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
	CONSTRAINT "contact_points_owner_check" CHECK (num_nonnulls(user_id, household_id) = 1),
	CONSTRAINT "contact_points_phone_check" CHECK (kind <> 'phone' or normalized is null or normalized ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "contact_points_email_check" CHECK (kind <> 'email' or normalized is null or (normalized = lower(normalized) and strpos(normalized, '@') > 1)),
	CONSTRAINT "contact_points_postal_kind_check" CHECK ((kind = 'postal') = (postal is not null) and (kind <> 'postal' or normalized is null)),
	CONSTRAINT "contact_points_security_check" CHECK (not (purposes && '{security,recovery,login}') or (kind <> 'postal' and verified_at is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."contact_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "document_files_file_purpose_check" CHECK (file_purpose in ('document_media', 'attachment', 'site_media'))
);
--> statement-breakpoint
ALTER TABLE "core"."document_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "documents_kind_check" CHECK (kind in ('rich_text', 'newsletter', 'page', 'lesson', 'transcript')),
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
CREATE TABLE "core"."erasure_approvals" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"request_reference" text,
	"approved_by_user_id" uuid NOT NULL,
	"second_approver_user_id" uuid,
	CONSTRAINT "erasure_approvals_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "erasure_approvals_basis_check" CHECK (basis in ('data_subject_request', 'retention_schedule', 'regulator_order')),
	CONSTRAINT "erasure_approvals_request_reference_check" CHECK (char_length(request_reference) between 1 and 120),
	CONSTRAINT "erasure_approvals_approvers_check" CHECK (second_approver_user_id is distinct from approved_by_user_id)
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
	CONSTRAINT "erasure_items_object_type_check" CHECK (object_type in ('file', 'document', 'household'))
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
	CONSTRAINT "external_ids_sensitive_check" CHECK (system_meaning not in ('national_id', 'passport') or identifier_ciphertext is not null),
	CONSTRAINT "external_ids_suffix_check" CHECK (system_meaning <> 'national_id' or identifier_last4 is null),
	CONSTRAINT "external_ids_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."external_ids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"derivatives" jsonb DEFAULT '{}' NOT NULL,
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
	CONSTRAINT "files_purpose_check" CHECK (purpose in ('document_media', 'attachment', 'submission', 'avatar', 'logo', 'site_media', 'health_report', 'legal_document', 'evidence', 'import_source', 'export')),
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
	CONSTRAINT "files_host_pair_check" CHECK ((host_type is null) = (host_id is null)),
	CONSTRAINT "files_rejection_check" CHECK ((state = 'rejected') = (rejection_reason is not null)),
	CONSTRAINT "files_ready_check" CHECK (state <> 'ready' or (sha256 is not null and ready_at is not null)),
	CONSTRAINT "files_key_check" CHECK ((encryption = 'tenant_dek') = (key_version is not null)),
	CONSTRAINT "files_storage_prefix_check" CHECK (starts_with(storage_key, 't/' || tenant_id::text || '/')),
	CONSTRAINT "files_derivatives_prefix_check" CHECK (not jsonb_path_exists(derivatives, '$.*.key ? (!(@ starts with $p))', jsonb_build_object('p', 't/' || tenant_id::text || '/'))),
	CONSTRAINT "files_health_report_check" CHECK (purpose <> 'health_report' or (derivatives = '{}' and name ~ '^medical-report(\.[a-z0-9]{1,8})?$' and (state <> 'ready' or encryption = 'tenant_dek')))
);
--> statement-breakpoint
ALTER TABLE "core"."files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "records_metadata_empty_check" CHECK (metadata = '{}')
);
--> statement-breakpoint
ALTER TABLE "health"."records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."household_members" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_kind" text NOT NULL,
	"residence" text DEFAULT 'primary' NOT NULL,
	"valid_during" daterange NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "household_members_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "household_members_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "household_members_version_check" CHECK (version > 0),
	CONSTRAINT "household_members_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "household_members_member_kind_check" CHECK (member_kind in ('adult', 'child')),
	CONSTRAINT "household_members_residence_check" CHECK (residence in ('primary', 'secondary')),
	CONSTRAINT "household_members_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."household_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."households" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"name_en" text,
	"name_ar" text,
	"primary_language" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "households_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "households_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "households_version_check" CHECK (version > 0),
	CONSTRAINT "households_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "households_name_en_check" CHECK (char_length(name_en) between 1 and 120),
	CONSTRAINT "households_name_ar_check" CHECK (char_length(name_ar) between 1 and 120),
	CONSTRAINT "households_primary_language_check" CHECK (primary_language ~ '^[a-z]{2,3}$')
);
--> statement-breakpoint
ALTER TABLE "core"."households" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."idempotency_keys" (
	"tenant_id" uuid,
	"account_id" uuid,
	"key" text,
	"request_hash" bytea NOT NULL,
	"procedure" text NOT NULL,
	"response_status" smallint,
	"response_body" jsonb,
	"resource_type" text,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT statement_timestamp() + interval '24 hours' NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("tenant_id","account_id","key"),
	CONSTRAINT "idempotency_keys_key_check" CHECK (char_length(key) between 8 and 255),
	CONSTRAINT "idempotency_keys_request_hash_check" CHECK (octet_length(request_hash) = 32),
	CONSTRAINT "idempotency_keys_procedure_check" CHECK (char_length(procedure) between 1 and 120),
	CONSTRAINT "idempotency_keys_response_status_check" CHECK (response_status between 100 and 599),
	CONSTRAINT "idempotency_keys_resource_type_check" CHECK (char_length(resource_type) between 1 and 63)
);
--> statement-breakpoint
ALTER TABLE "core"."idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"identity_provider_id" uuid,
	"subject" text,
	"issuer_tenant" text,
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
	CONSTRAINT "login_identities_kind_check" CHECK (kind in ('password', 'oidc', 'saml', 'clever', 'classlink', 'badge')),
	CONSTRAINT "login_identities_subject_check" CHECK (char_length(subject) between 1 and 256),
	CONSTRAINT "login_identities_issuer_tenant_check" CHECK (char_length(issuer_tenant) between 1 and 256),
	CONSTRAINT "login_identities_login_name_check" CHECK (char_length(login_name) between 1 and 254 and login_name = lower(login_name)),
	CONSTRAINT "login_identities_secret_hash_check" CHECK (char_length(secret_hash) between 20 and 512),
	CONSTRAINT "login_identities_pin_hash_check" CHECK (char_length(pin_hash) between 20 and 512),
	CONSTRAINT "login_identities_link_method_check" CHECK (link_method in ('roster_external_id', 'verified_domain', 'invitation', 'admin', 'import', 'self_service')),
	CONSTRAINT "login_identities_failed_attempts_check" CHECK (failed_attempts between 0 and 100),
	CONSTRAINT "login_identities_void_reason_check" CHECK (void_reason in ('lost', 'rollover', 'aged_out', 'admin', 'compromised', 'unused', 'merge_pending')),
	CONSTRAINT "login_identities_federated_check" CHECK ((kind in ('oidc', 'saml', 'clever', 'classlink')) = (identity_provider_id is not null and subject is not null)),
	CONSTRAINT "login_identities_password_check" CHECK ((kind = 'password') = (login_name is not null) and (kind <> 'password' or secret_hash is not null)),
	CONSTRAINT "login_identities_badge_check" CHECK (kind <> 'badge' or (secret_hash is not null and expires_at is not null)),
	CONSTRAINT "login_identities_void_check" CHECK ((voided_at is null) = (void_reason is null))
);
--> statement-breakpoint
ALTER TABLE "core"."login_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"default_locale" text,
	"week_start" smallint DEFAULT 7 NOT NULL,
	"weekend_days" smallint[] DEFAULT '{5,6}'::smallint[] NOT NULL,
	"country_code" text,
	"address" jsonb,
	"phone" text,
	"email" text,
	"website_url" text,
	"logo_file_id" uuid,
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
	CONSTRAINT "orgs_country_code_check" CHECK (country_code ~ '^[A-Z]{2}$'),
	CONSTRAINT "orgs_address_check" CHECK (jsonb_typeof(address) = 'object'),
	CONSTRAINT "orgs_phone_check" CHECK (char_length(phone) between 1 and 40),
	CONSTRAINT "orgs_email_check" CHECK (char_length(email) between 3 and 254),
	CONSTRAINT "orgs_website_url_check" CHECK (char_length(website_url) between 1 and 2048),
	CONSTRAINT "orgs_lifecycle_check" CHECK (lifecycle in ('importing', 'active')),
	CONSTRAINT "orgs_name_check" CHECK (num_nonnulls(name_en, name_ar) >= 1),
	CONSTRAINT "orgs_parent_pair_check" CHECK ((parent_id is null) = (parent_type is null)),
	CONSTRAINT "orgs_hierarchy_check" CHECK ((type = 'school_group' and parent_id is null) or (type = 'school' and (parent_type is null or parent_type = 'school_group')) or (type = 'department' and parent_type in ('school', 'school_group'))),
	CONSTRAINT "orgs_school_time_zone_check" CHECK (type <> 'school' or time_zone is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "privacy_notices_purpose_check" CHECK ((kind = 'consent_text') = (purpose_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "sessions_active_role_check" CHECK (active_role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative')),
	CONSTRAINT "sessions_client_kind_check" CHECK (client_kind in ('web', 'ios', 'android', 'shared_device')),
	CONSTRAINT "sessions_user_agent_summary_check" CHECK (char_length(user_agent_summary) between 1 and 200),
	CONSTRAINT "sessions_revoked_reason_check" CHECK (revoked_reason in ('sign_out', 'admin', 'credential_change', 'context_switch', 'reuse_detected', 'account_disabled', 'superseded', 'tenant_merged')),
	CONSTRAINT "sessions_authenticator_check" CHECK (num_nonnulls(login_identity_id, passkey_id) <= 1),
	CONSTRAINT "sessions_expiry_check" CHECK (idle_expires_at <= absolute_expires_at and authenticated_at <= last_seen_at),
	CONSTRAINT "sessions_revoked_check" CHECK ((revoked_at is null) = (revoked_reason is null))
);
--> statement-breakpoint
ALTER TABLE "core"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops"."sms_suppressions" (
	"address_hmac" bytea,
	"sender_id" text,
	"suppressed_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "sms_suppressions_pkey" PRIMARY KEY("address_hmac","sender_id"),
	CONSTRAINT "sms_suppressions_address_hmac_check" CHECK (octet_length(address_hmac) = 32),
	CONSTRAINT "sms_suppressions_sender_id_check" CHECK (char_length(sender_id) between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "core"."student_school_years" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"valid_during" daterange NOT NULL,
	"grade_level_descriptor_id" uuid,
	"grade_level_ns" text GENERATED ALWAYS AS ('grade_level') STORED NOT NULL,
	"calendar_id" uuid,
	"entry_type_descriptor_id" uuid,
	"entry_type_ns" text GENERATED ALWAYS AS ('school_entry_type') STORED NOT NULL,
	"exit_type_descriptor_id" uuid,
	"exit_type_ns" text GENERATED ALWAYS AS ('school_exit_type') STORED NOT NULL,
	"next_year_outcome" text,
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
	CONSTRAINT "student_school_years_source_check" CHECK (source in ('manual', 'import', 'sis', 'oneroster', 'rollover')),
	CONSTRAINT "student_school_years_valid_during_check" CHECK (not isempty("valid_during") and not lower_inf("valid_during") and not upper_inf("valid_during") and lower_inc("valid_during") and not upper_inc("valid_during"))
);
--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "tenant_registry_lifecycle_check" CHECK (lifecycle in ('provisioning', 'importing', 'active', 'frozen', 'suspended', 'offboarding'))
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
	"lives_with" boolean,
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
	CONSTRAINT "user_roles_role_check" CHECK (role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative')),
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
	"custody_alert" boolean DEFAULT false NOT NULL,
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
CREATE UNIQUE INDEX "academic_sessions_current_key" ON "core"."academic_sessions" ("tenant_id","org_id") WHERE type = 'school_year' and lifecycle = 'current' and status = 'active';--> statement-breakpoint
CREATE INDEX "academic_sessions_year_idx" ON "core"."academic_sessions" ("tenant_id","school_year_id","type");--> statement-breakpoint
CREATE INDEX "academic_sessions_delta_idx" ON "core"."academic_sessions" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_weeks_number_key" ON "core"."academic_weeks" ("tenant_id","school_year_id","number") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "access_role_assignments_user_idx" ON "core"."access_role_assignments" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "access_role_assignments_role_idx" ON "core"."access_role_assignments" ("tenant_id","access_role_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_key" ON "core"."accounts" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "accounts_delta_idx" ON "core"."accounts" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "auth_attempts_window_idx" ON "core"."auth_attempts" ("tenant_id","window_ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_dates_day_key" ON "core"."calendar_dates" ("tenant_id","calendar_id","day_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_grade_levels_key" ON "core"."calendar_grade_levels" ("tenant_id","calendar_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_code_key" ON "core"."calendars" ("tenant_id","school_year_id","code") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_school_key" ON "core"."calendars" ("tenant_id","school_year_id") WHERE kind = 'school' and status = 'active';--> statement-breakpoint
CREATE INDEX "consent_records_subject_idx" ON "core"."consent_records" ("tenant_id","subject_user_id","purpose_descriptor_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contact_points_lookup_idx" ON "core"."contact_points" ("tenant_id","kind","normalized") WHERE status = 'active' and normalized is not null;--> statement-breakpoint
CREATE INDEX "contact_points_user_idx" ON "core"."contact_points" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_points_user_value_key" ON "core"."contact_points" ("tenant_id","user_id","kind","normalized") WHERE status = 'active' and user_id is not null and normalized is not null;--> statement-breakpoint
CREATE INDEX "contact_points_delta_idx" ON "core"."contact_points" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "demographics_delta_idx" ON "core"."demographics" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "descriptor_overrides_key" ON "core"."descriptor_overrides" ("tenant_id","descriptor_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "descriptors_namespace_idx" ON "core"."descriptors" ("tenant_id","namespace","sort_order");--> statement-breakpoint
CREATE INDEX "devices_account_idx" ON "core"."devices" ("tenant_id","account_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "document_files_key" ON "core"."document_files" ("tenant_id","document_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_files_file_idx" ON "core"."document_files" ("tenant_id","file_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_links_document_idx" ON "core"."document_links" ("tenant_id","document_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_links_target_idx" ON "core"."document_links" ("tenant_id","target_type","target_id") WHERE status = 'active' and target_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "document_translations_key" ON "core"."document_translations" ("tenant_id","document_id","target_locale") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_versions_document_idx" ON "core"."document_versions" ("tenant_id","document_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_host_idx" ON "core"."documents" ("tenant_id","host_type","host_id");--> statement-breakpoint
CREATE INDEX "documents_translation_idx" ON "core"."documents" ("tenant_id","translation_of_id") WHERE translation_of_id is not null;--> statement-breakpoint
CREATE INDEX "erasure_approvals_subject_idx" ON "core"."erasure_approvals" ("tenant_id","subject_user_id");--> statement-breakpoint
CREATE INDEX "erasure_items_object_idx" ON "core"."erasure_items" ("tenant_id","object_type","object_id");--> statement-breakpoint
CREATE INDEX "external_ids_user_idx" ON "core"."external_ids" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "external_ids_delta_idx" ON "core"."external_ids" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "file_publications_file_idx" ON "core"."file_publications" ("tenant_id","file_id") WHERE status = 'active' and unpublished_at is null;--> statement-breakpoint
CREATE INDEX "file_publications_host_idx" ON "core"."file_publications" ("tenant_id","host_type","host_id") WHERE status = 'active' and unpublished_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "file_subjects_key" ON "core"."file_subjects" ("tenant_id","file_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "file_subjects_user_idx" ON "core"."file_subjects" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_host_idx" ON "core"."files" ("tenant_id","host_type","host_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_state_idx" ON "core"."files" ("tenant_id","state","created_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "files_storage_key_idx" ON "core"."files" ("tenant_id","storage_key");--> statement-breakpoint
CREATE INDEX "records_student_idx" ON "health"."records" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "household_members_user_idx" ON "core"."household_members" ("tenant_id","user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "core"."idempotency_keys" ("tenant_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_orgs_key" ON "core"."identity_provider_orgs" ("tenant_id","identity_provider_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "identity_providers_issuer_key" ON "core"."identity_providers" ("tenant_id","protocol","issuer") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "legal_holds_subject_idx" ON "core"."legal_holds" ("tenant_id","subject_user_id") WHERE status = 'active' and released_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code_key" ON "core"."locations" ("tenant_id","org_id","code") WHERE status = 'active' and code is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identities_subject_key" ON "core"."login_identities" ("tenant_id","identity_provider_id","subject") WHERE status = 'active' and subject is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identities_login_name_key" ON "core"."login_identities" ("tenant_id","login_name") WHERE status = 'active' and kind = 'password' and voided_at is null;--> statement-breakpoint
CREATE INDEX "login_identities_account_idx" ON "core"."login_identities" ("tenant_id","account_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "org_features_key" ON "core"."org_features" ("tenant_id","org_id","feature") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_root_key" ON "core"."orgs" ("tenant_id") WHERE parent_id is null and status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_identifier_key" ON "core"."orgs" ("tenant_id","identifier") WHERE status = 'active' and identifier is not null;--> statement-breakpoint
CREATE INDEX "orgs_parent_idx" ON "core"."orgs" ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "orgs_delta_idx" ON "core"."orgs" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE INDEX "passkeys_account_idx" ON "core"."passkeys" ("tenant_id","account_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "core"."saved_views" ("tenant_id","owner_user_id","surface") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "saved_views_shared_idx" ON "core"."saved_views" ("tenant_id","org_id","surface") WHERE status = 'active' and shared;--> statement-breakpoint
CREATE INDEX "seal_members_batch_idx" ON "audit"."seal_members" ("tenant_id","batch_no");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "core"."sessions" ("tenant_id","account_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "core"."sessions" ("tenant_id","absolute_expires_at");--> statement-breakpoint
CREATE INDEX "student_school_years_student_idx" ON "core"."student_school_years" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_school_years_year_idx" ON "core"."student_school_years" ("tenant_id","school_year_id","grade_level_descriptor_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "student_school_years_delta_idx" ON "core"."student_school_years" ("tenant_id","date_last_modified");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_keys_active_key" ON "core"."tenant_keys" ("tenant_id","purpose") WHERE retired_at is null;--> statement-breakpoint
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
ALTER TABLE "core"."academic_sessions" ADD CONSTRAINT "academic_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."academic_sessions" ADD CONSTRAINT "academic_sessions_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."academic_sessions" ADD CONSTRAINT "academic_sessions_tenant_id_parent_id_parent_type_school_y_fkey" FOREIGN KEY ("tenant_id","parent_id","parent_type","school_year_id","org_id","school_year") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id","school_year");--> statement-breakpoint
ALTER TABLE "core"."academic_weeks" ADD CONSTRAINT "academic_weeks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
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
ALTER TABLE "audit"."anchors" ADD CONSTRAINT "anchors_tenant_id_batch_no_fkey" FOREIGN KEY ("tenant_id","batch_no") REFERENCES "audit"."seal_batches"("tenant_id","batch_no");--> statement-breakpoint
ALTER TABLE "core"."auth_attempts" ADD CONSTRAINT "auth_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_tenant_id_calendar_id_school_year_id_fkey" FOREIGN KEY ("tenant_id","calendar_id","school_year_id") REFERENCES "core"."calendars"("tenant_id","id","school_year_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_tenant_id_event_descriptor_id_event_ns_fkey" FOREIGN KEY ("tenant_id","event_descriptor_id","event_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."calendar_grade_levels" ADD CONSTRAINT "calendar_grade_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_grade_levels" ADD CONSTRAINT "calendar_grade_levels_tenant_id_calendar_id_fkey" FOREIGN KEY ("tenant_id","calendar_id") REFERENCES "core"."calendars"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_grade_levels" ADD CONSTRAINT "calendar_grade_levels_tenant_id_grade_level_descriptor_id__fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."calendars" ADD CONSTRAINT "calendars_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendars" ADD CONSTRAINT "calendars_tenant_id_school_year_id_school_year_type_school_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_tenant_id_school_year_id_school_year_type_sc_fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_purpose_descriptor_id_purpose_ns_fkey" FOREIGN KEY ("tenant_id","purpose_descriptor_id","purpose_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_notice_id_fkey" FOREIGN KEY ("tenant_id","notice_id") REFERENCES "core"."privacy_notices"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_given_by_user_id_fkey" FOREIGN KEY ("tenant_id","given_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_relationship_id_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "core"."user_relationships"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_evidence_file_id_fkey" FOREIGN KEY ("tenant_id","evidence_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_household_id_fkey" FOREIGN KEY ("tenant_id","household_id") REFERENCES "core"."households"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."contact_points" ADD CONSTRAINT "contact_points_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
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
ALTER TABLE "core"."document_files" ADD CONSTRAINT "document_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_files" ADD CONSTRAINT "document_files_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_files" ADD CONSTRAINT "document_files_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."document_links" ADD CONSTRAINT "document_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_links" ADD CONSTRAINT "document_links_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
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
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_approved_by_user_id_fkey" FOREIGN KEY ("tenant_id","approved_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_tenant_id_second_approver_user_id_fkey" FOREIGN KEY ("tenant_id","second_approver_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."erasure_items" ADD CONSTRAINT "erasure_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."erasure_items" ADD CONSTRAINT "erasure_items_tenant_id_approval_id_fkey" FOREIGN KEY ("tenant_id","approval_id") REFERENCES "core"."erasure_approvals"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_system_descriptor_id_system_ns_syst_fkey" FOREIGN KEY ("tenant_id","system_descriptor_id","system_ns","system_meaning") REFERENCES "core"."descriptors"("tenant_id","id","namespace","system_meaning");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_assigning_org_id_fkey" FOREIGN KEY ("tenant_id","assigning_org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."external_ids" ADD CONSTRAINT "external_ids_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "core"."file_publications" ADD CONSTRAINT "file_publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."file_publications" ADD CONSTRAINT "file_publications_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."file_subjects" ADD CONSTRAINT "file_subjects_tenant_id_tagged_by_user_id_fkey" FOREIGN KEY ("tenant_id","tagged_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_uploaded_by_user_id_fkey" FOREIGN KEY ("tenant_id","uploaded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_kind_descriptor_id_kind_ns_fkey" FOREIGN KEY ("tenant_id","kind_descriptor_id","kind_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "health"."records" ADD CONSTRAINT "records_tenant_id_file_id_file_purpose_fkey" FOREIGN KEY ("tenant_id","file_id","file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."household_members" ADD CONSTRAINT "household_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."household_members" ADD CONSTRAINT "household_members_tenant_id_household_id_fkey" FOREIGN KEY ("tenant_id","household_id") REFERENCES "core"."households"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."household_members" ADD CONSTRAINT "household_members_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."households" ADD CONSTRAINT "households_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
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
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_subject_user_id_fkey" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_placed_by_user_id_fkey" FOREIGN KEY ("tenant_id","placed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."legal_holds" ADD CONSTRAINT "legal_holds_tenant_id_released_by_user_id_fkey" FOREIGN KEY ("tenant_id","released_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_tenant_id_org_id_org_type_fkey" FOREIGN KEY ("tenant_id","org_id","org_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_tenant_id_parent_location_id_fkey" FOREIGN KEY ("tenant_id","parent_location_id") REFERENCES "core"."locations"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_identity_provider_id_fkey" FOREIGN KEY ("tenant_id","identity_provider_id") REFERENCES "core"."identity_providers"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."login_identities" ADD CONSTRAINT "login_identities_tenant_id_linked_by_user_id_fkey" FOREIGN KEY ("tenant_id","linked_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."org_features" ADD CONSTRAINT "org_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."org_features" ADD CONSTRAINT "org_features_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_tenant_id_parent_id_parent_type_fkey" FOREIGN KEY ("tenant_id","parent_id","parent_type") REFERENCES "core"."orgs"("tenant_id","id","type");--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_tenant_id_logo_file_id_fkey" FOREIGN KEY ("tenant_id","logo_file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."passkeys" ADD CONSTRAINT "passkeys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."passkeys" ADD CONSTRAINT "passkeys_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id","account_id") REFERENCES "core"."accounts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_purpose_descriptor_id_purpose_ns_fkey" FOREIGN KEY ("tenant_id","purpose_descriptor_id","purpose_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_supersedes_id_fkey" FOREIGN KEY ("tenant_id","supersedes_id") REFERENCES "core"."privacy_notices"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_relationship_id_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "core"."user_relationships"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_court_order_file_id_co_fkey" FOREIGN KEY ("tenant_id","court_order_file_id","court_order_file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
ALTER TABLE "core"."relationship_restrictions" ADD CONSTRAINT "relationship_restrictions_tenant_id_verification_file_id_v_fkey" FOREIGN KEY ("tenant_id","verification_file_id","verification_file_purpose") REFERENCES "core"."files"("tenant_id","id","purpose");--> statement-breakpoint
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
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_school_year_id_school_year__fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_grade_level_descriptor_id_g_fkey" FOREIGN KEY ("tenant_id","grade_level_descriptor_id","grade_level_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_calendar_id_school_year_id_fkey" FOREIGN KEY ("tenant_id","calendar_id","school_year_id") REFERENCES "core"."calendars"("tenant_id","id","school_year_id");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_entry_type_descriptor_id_en_fkey" FOREIGN KEY ("tenant_id","entry_type_descriptor_id","entry_type_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_exit_type_descriptor_id_exi_fkey" FOREIGN KEY ("tenant_id","exit_type_descriptor_id","exit_type_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_tenant_id_import_run_id_fkey" FOREIGN KEY ("tenant_id","import_run_id") REFERENCES "core"."import_runs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."tenant_keys" ADD CONSTRAINT "tenant_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "audit"."anchors" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "audit"."anchors" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "audit"."anchors" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "audit"."anchors" AS PERMISSIVE FOR INSERT TO "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."auth_attempts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."auth_attempts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."auth_attempts" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."auth_attempts" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."auth_attempts" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."auth_attempts" AS PERMISSIVE FOR DELETE TO "retention" USING (window_ends_at < statement_timestamp());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_dates" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_dates" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_dates" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_dates" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_dates" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."calendar_dates" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_grade_levels" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_grade_levels" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_grade_levels" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_grade_levels" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_grade_levels" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."calendar_grade_levels" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendars" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendars" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendars" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendars" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendars" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."calendars" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."class_periods" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."class_periods" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."class_periods" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."class_periods" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."class_periods" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."class_periods" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."consent_records" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."consent_records" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."consent_records" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."consent_records" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."contact_points" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."contact_points" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."contact_points" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."contact_points" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."contact_points" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."contact_points" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."contact_points" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, user_id) or app.erasure_listed(tenant_id, 'household', household_id)) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."contact_points" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, user_id) or app.erasure_listed(tenant_id, 'household', household_id)));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."demographics" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."demographics" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."demographics" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."demographics" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."demographics" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."demographics" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "core"."demographics" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'demographics') WITH CHECK ((select current_setting('app.purpose', true)) = 'demographics');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."demographics" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."descriptor_overrides" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."descriptor_overrides" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."descriptor_overrides" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."descriptor_overrides" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."descriptor_overrides" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."descriptor_overrides" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "core"."document_files" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_files" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_files" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_files" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_files" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_links" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_links" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_links" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_links" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_links" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "health"."records" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "health"."records" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "health"."records" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "health"."records" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "health"."records" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "health"."records" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'health') WITH CHECK ((select current_setting('app.purpose', true)) = 'health');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "health"."records" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "health"."records" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."household_members" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."household_members" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."household_members" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."household_members" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."household_members" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."household_members" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."household_members" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."households" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."households" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."households" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."households" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."households" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."households" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'household', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."households" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_listed(tenant_id, 'household', "id")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."idempotency_keys" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."idempotency_keys" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."idempotency_keys" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."idempotency_keys" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."idempotency_keys" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."idempotency_keys" AS PERMISSIVE FOR DELETE TO "retention" USING (expires_at < statement_timestamp() or exists (select 1 from core.accounts a where a.tenant_id = "idempotency_keys".tenant_id and a.id = "idempotency_keys".account_id and app.erasure_approved(a.tenant_id, a.user_id)));--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "core"."legal_holds" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."legal_holds" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."legal_holds" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."legal_holds" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."legal_holds" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "core"."passkeys" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."passkeys" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."passkeys" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."passkeys" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."passkeys" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."passkeys" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.accounts a where a.tenant_id = "passkeys".tenant_id and a.id = "passkeys".account_id and app.erasure_approved(a.tenant_id, a.user_id))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."passkeys" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.accounts a where a.tenant_id = "passkeys".tenant_id and a.id = "passkeys".account_id and app.erasure_approved(a.tenant_id, a.user_id))));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."privacy_notices" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."privacy_notices" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."privacy_notices" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."privacy_notices" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."privacy_notices" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."relationship_restrictions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."relationship_restrictions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."relationship_restrictions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."relationship_restrictions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."relationship_restrictions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "core"."relationship_restrictions" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'custody') WITH CHECK ((select current_setting('app.purpose', true)) = 'custody');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."relationship_restrictions" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.user_relationships r where r.tenant_id = relationship_restrictions.tenant_id and r.id = relationship_restrictions.relationship_id and (app.erasure_approved(r.tenant_id, r.student_user_id) or app.erasure_approved(r.tenant_id, r.related_user_id)))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."relationship_restrictions" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.user_relationships r where r.tenant_id = relationship_restrictions.tenant_id and r.id = relationship_restrictions.relationship_id and (app.erasure_approved(r.tenant_id, r.student_user_id) or app.erasure_approved(r.tenant_id, r.related_user_id)))));--> statement-breakpoint
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
CREATE POLICY "tenant_isolation" ON "core"."student_school_years" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."student_school_years" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."student_school_years" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."student_school_years" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."student_school_years" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_integration_select" ON "core"."student_school_years" AS PERMISSIVE FOR SELECT TO "integration" USING (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."student_school_years" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
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
CREATE POLICY "p_erase_update" ON "core"."users" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "id")) WITH CHECK (status = 'tobedeleted');