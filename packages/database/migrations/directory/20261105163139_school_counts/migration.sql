ALTER TABLE "school_usage" ADD COLUMN "students" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "staff_accounts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "signed_in_7d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "signed_in_30d" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage" ADD COLUMN "video_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_usage" ADD CONSTRAINT "school_usage_counts_check" CHECK (students >= 0 and staff_accounts >= 0 and signed_in_7d >= 0 and signed_in_30d >= 0 and video_minutes >= 0);