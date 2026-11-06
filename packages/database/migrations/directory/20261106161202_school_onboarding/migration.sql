CREATE TABLE "school_onboarding" (
	"school_id" uuid,
	"item" text,
	"reached_at" timestamp with time zone NOT NULL,
	"operator_id" text,
	CONSTRAINT "school_onboarding_pkey" PRIMARY KEY("school_id","item"),
	CONSTRAINT "school_onboarding_item_check" CHECK (item in ('admin_signed_in', 'school_details', 'year_ready', 'classes', 'staff_invited', 'staff_signed_in', 'students_imported', 'guardians_linked', 'families_signed_in', 'first_assignment', 'first_register', 'website_published', 'custom_domain', 'first_invoice_paid', 'kickoff_call', 'training', 'data_import'))
);
--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "school_days_7d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "failed_deliveries_1d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_onboarding" ADD CONSTRAINT "school_onboarding_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_usage" DROP CONSTRAINT "school_usage_counts_check", ADD CONSTRAINT "school_usage_counts_check" CHECK (students >= 0 and staff_accounts >= 0 and signed_in_7d >= 0 and signed_in_30d >= 0 and video_minutes >= 0 and emails_this_month >= 0 and school_days_7d between 0 and 7 and failed_deliveries_1d >= 0);