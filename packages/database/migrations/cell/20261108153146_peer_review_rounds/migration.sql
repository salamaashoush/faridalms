CREATE TABLE "core"."peer_review_comments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"review_id" uuid NOT NULL,
	"anchor" jsonb NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "peer_review_comments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "peer_review_comments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "peer_review_comments_version_check" CHECK (version > 0),
	CONSTRAINT "peer_review_comments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "peer_review_comments_anchor_check" CHECK (jsonb_typeof(anchor) = 'object'),
	CONSTRAINT "peer_review_comments_body_check" CHECK (char_length(body) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."peer_review_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "peer_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "peer_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD COLUMN "helpfulness" text;--> statement-breakpoint
CREATE INDEX "peer_review_comments_review_idx" ON "core"."peer_review_comments" ("tenant_id","review_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."peer_review_comments" ADD CONSTRAINT "peer_review_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."peer_review_comments" ADD CONSTRAINT "peer_review_comments_tenant_id_review_id_fkey" FOREIGN KEY ("tenant_id","review_id") REFERENCES "core"."peer_reviews"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_helpfulness_check" CHECK (helpfulness is null or (helpfulness in ('very', 'somewhat', 'not') and sent_at is not null));--> statement-breakpoint
ALTER TABLE "core"."assignments" DROP CONSTRAINT "assignments_peer_check", ADD CONSTRAINT "assignments_peer_check" CHECK ((peer_reviews is null) = (peer_anonymous is null) and (peer_reviews is null or (peer_reviews between 1 and 5 and submission_format in ('online', 'files', 'both', 'online_and_files', 'quiz', 'discussion'))) and (peer_started_at is null or peer_reviews is not null) and (peer_released_at is null or peer_started_at is not null) and (peer_due_at is null or peer_reviews is not null) and (peer_reminded_at is null or peer_due_at is not null));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."peer_review_comments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."peer_review_comments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."peer_review_comments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."peer_review_comments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."peer_review_comments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."peer_review_comments" AS PERMISSIVE FOR UPDATE TO "retention" USING (exists (select 1 from core.peer_reviews r where r.tenant_id = peer_review_comments.tenant_id and r.id = peer_review_comments.review_id and (app.erasure_approved(r.tenant_id, r.reviewer_user_id) or app.erasure_approved(r.tenant_id, r.author_user_id)))) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."peer_review_comments" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (exists (select 1 from core.peer_reviews r where r.tenant_id = peer_review_comments.tenant_id and r.id = peer_review_comments.review_id and (app.erasure_approved(r.tenant_id, r.reviewer_user_id) or app.erasure_approved(r.tenant_id, r.author_user_id)))));