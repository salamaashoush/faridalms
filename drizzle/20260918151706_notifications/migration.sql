CREATE TYPE "announcement_audience" AS ENUM('everyone', 'parents', 'students', 'teachers');--> statement-breakpoint
CREATE TYPE "announcement_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "delivery_state" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "notification_channel" AS ENUM('in_app', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "notification_locale" AS ENUM('en', 'ar');--> statement-breakpoint
CREATE TYPE "notification_type" AS ENUM('assignment_published', 'assessment_released', 'message_received', 'announcement_published', 'newsletter_published');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY,
	"school_year_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"document" jsonb NOT NULL,
	"summary" text NOT NULL,
	"audience" "announcement_audience" DEFAULT 'everyone'::"announcement_audience" NOT NULL,
	"status" "announcement_status" DEFAULT 'draft'::"announcement_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"author_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"notification_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"state" "delivery_state" DEFAULT 'pending'::"delivery_state" NOT NULL,
	"address" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"provider_receipt" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_channel_key" UNIQUE("notification_id","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" "notification_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"actor_id" uuid,
	"payload" jsonb NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY,
	"email" boolean DEFAULT true NOT NULL,
	"sms" boolean DEFAULT false NOT NULL,
	"locale" "notification_locale" DEFAULT 'en'::"notification_locale" NOT NULL,
	"muted_types" "notification_type"[] DEFAULT '{}'::"notification_type"[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_event_recipient_key" UNIQUE("event_id","recipient_id")
);
--> statement-breakpoint
ALTER TABLE "newsletter_drafts" ADD COLUMN "published_newsletter_id" uuid;--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "draft_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile" varchar(32);--> statement-breakpoint
ALTER TABLE "newsletters" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" ("status","published_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries" ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_idx" ON "notification_deliveries" ("created_at");--> statement-breakpoint
CREATE INDEX "notification_events_created_idx" ON "notification_events" ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" ("recipient_id","read_at","created_at");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_year_id_school_years_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_notification_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE;