ALTER TABLE "core"."admission_form_versions" DROP CONSTRAINT "admission_form_versions_questions_check";--> statement-breakpoint
ALTER TABLE "core"."admission_forms" DROP CONSTRAINT "admission_forms_questions_check";--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" DROP COLUMN "questions";--> statement-breakpoint
ALTER TABLE "core"."admission_forms" DROP COLUMN "questions";--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ALTER COLUMN "primary_locale" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_primary_locale_check" CHECK (primary_locale in ('en', 'ar'));--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_body_check" CHECK (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144);--> statement-breakpoint
ALTER TABLE "core"."admission_form_versions" ADD CONSTRAINT "admission_form_versions_translation_check" CHECK (translation is null or (jsonb_typeof(translation) = 'object' and octet_length(translation::text) <= 262144));--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_primary_locale_check" CHECK (primary_locale in ('en', 'ar'));--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_body_check" CHECK (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144);--> statement-breakpoint
ALTER TABLE "core"."admission_forms" ADD CONSTRAINT "admission_forms_translation_check" CHECK (translation is null or (jsonb_typeof(translation) = 'object' and octet_length(translation::text) <= 262144));