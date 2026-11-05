CREATE TABLE "school_usage_daily" (
	"school_id" uuid,
	"day" date,
	"emails" integer NOT NULL,
	"sms" integer NOT NULL,
	"sign_ins" integer NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "school_usage_daily_pkey" PRIMARY KEY("school_id","day"),
	CONSTRAINT "school_usage_daily_counts_check" CHECK (emails >= 0 and sms >= 0 and sign_ins >= 0)
);
--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "emails_this_month" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage_daily" ADD CONSTRAINT "school_usage_daily_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_usage" DROP CONSTRAINT "school_usage_counts_check", ADD CONSTRAINT "school_usage_counts_check" CHECK (students >= 0 and staff_accounts >= 0 and signed_in_7d >= 0 and signed_in_30d >= 0 and video_minutes >= 0 and emails_this_month >= 0);