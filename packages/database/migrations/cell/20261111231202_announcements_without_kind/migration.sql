ALTER TABLE "core"."broadcasts" DROP CONSTRAINT "broadcasts_kind_check";--> statement-breakpoint
ALTER TABLE "core"."broadcasts" DROP CONSTRAINT "broadcasts_announcement_check";--> statement-breakpoint
ALTER TABLE "core"."broadcasts" DROP CONSTRAINT "broadcasts_news_check";--> statement-breakpoint
ALTER TABLE "core"."broadcasts" DROP COLUMN "kind";--> statement-breakpoint
CREATE INDEX "broadcasts_org_idx" ON "core"."broadcasts" ("tenant_id","org_id","publish_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."broadcasts" ADD CONSTRAINT "broadcasts_website_check" CHECK (visibility = 'school' or slug is not null);--> statement-breakpoint
ALTER TABLE "core"."document_templates" DROP CONSTRAINT "document_templates_kind_check", ADD CONSTRAINT "document_templates_kind_check" CHECK (kind in ('lesson', 'assignment', 'unit_plan', 'announcement', 'event', 'consent_form', 'module', 'message', 'admission_letter', 'section'));