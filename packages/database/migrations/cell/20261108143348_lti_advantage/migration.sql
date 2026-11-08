ALTER TABLE "core"."lti_line_items" ADD COLUMN "submission_review" jsonb;--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD COLUMN "review_url" text;--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD COLUMN "grades" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD COLUMN "roster" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD COLUMN "registration" jsonb;--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" ADD CONSTRAINT "lti_line_items_submission_review_check" CHECK (submission_review is null or (jsonb_typeof(submission_review) = 'object' and octet_length(submission_review::text) <= 16384));--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD CONSTRAINT "lti_tools_review_url_check" CHECK (review_url is null or (review_url like 'https://%' and char_length(review_url) <= 500));--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD CONSTRAINT "lti_tools_state_check" CHECK (state in ('pending', 'active'));--> statement-breakpoint
ALTER TABLE "core"."lti_tools" ADD CONSTRAINT "lti_tools_registration_check" CHECK (registration is null or (jsonb_typeof(registration) = 'object' and octet_length(registration::text) <= 16384));