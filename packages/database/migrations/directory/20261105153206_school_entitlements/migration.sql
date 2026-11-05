CREATE TABLE "school_entitlements" (
	"school_id" uuid PRIMARY KEY,
	"modules" text[] NOT NULL,
	"pool_bytes" bigint NOT NULL,
	"class_bytes" bigint NOT NULL,
	"module_bytes" bigint NOT NULL,
	"person_bytes" bigint NOT NULL,
	"students" integer,
	"staff_accounts" integer,
	"video_hours" integer,
	"custom_domains" integer,
	"email_per_month" integer,
	"caption_minutes" integer,
	"access" text DEFAULT 'full' NOT NULL,
	"trial_ends_on" date,
	"notice" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "school_entitlements_modules_check" CHECK (modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[]),
	CONSTRAINT "school_entitlements_bytes_check" CHECK (pool_bytes > 0 and class_bytes > 0 and module_bytes > 0 and person_bytes > 0),
	CONSTRAINT "school_entitlements_limits_check" CHECK (coalesce(students, 0) >= 0 and coalesce(staff_accounts, 0) >= 0
        and coalesce(video_hours, 0) >= 0 and coalesce(custom_domains, 0) >= 0
        and coalesce(email_per_month, 0) >= 0 and coalesce(caption_minutes, 0) >= 0),
	CONSTRAINT "school_entitlements_access_check" CHECK (access in ('full', 'restricted', 'read_only')),
	CONSTRAINT "school_entitlements_notice_check" CHECK (notice in ('payment_overdue', 'plan_ends_soon')),
	CONSTRAINT "school_entitlements_revision_check" CHECK (revision > 0)
);
--> statement-breakpoint
ALTER TABLE "school_entitlements" ADD CONSTRAINT "school_entitlements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");