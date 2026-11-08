ALTER TABLE "core"."admission_form_versions" ADD COLUMN "primary_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD COLUMN "body" jsonb;--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD COLUMN "translation" jsonb;--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD COLUMN "primary_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD COLUMN "body" jsonb;--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD COLUMN "translation" jsonb;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" DROP CONSTRAINT "site_enquiries_answers_check", ADD CONSTRAINT "site_enquiries_answers_check" CHECK (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 131072);--> statement-breakpoint
ALTER TABLE "core"."admission_applications" DROP CONSTRAINT "admission_applications_form_check", ADD CONSTRAINT "admission_applications_form_check" CHECK (jsonb_typeof(form) = 'object' and octet_length(form::text) <= 131072);--> statement-breakpoint
ALTER TABLE "core"."admission_applications" DROP CONSTRAINT "admission_applications_answers_check", ADD CONSTRAINT "admission_applications_answers_check" CHECK (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 262144);