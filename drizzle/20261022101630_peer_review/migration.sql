CREATE TABLE "core"."peer_reviews" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"rubric_scores" jsonb DEFAULT '{}' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"suggestion" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "peer_reviews_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "peer_reviews_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "peer_reviews_version_check" CHECK (version > 0),
	CONSTRAINT "peer_reviews_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "peer_reviews_self_check" CHECK (reviewer_user_id <> author_user_id),
	CONSTRAINT "peer_reviews_rubric_scores_check" CHECK (jsonb_typeof(rubric_scores) = 'object' and octet_length(rubric_scores::text) <= 4096),
	CONSTRAINT "peer_reviews_comments_check" CHECK (char_length(strengths) <= 2000 and char_length(suggestion) <= 2000),
	CONSTRAINT "peer_reviews_sent_check" CHECK (sent_at is null or (strengths <> '' and suggestion <> '')),
	CONSTRAINT "peer_reviews_hidden_check" CHECK ((hidden_at is null) = (hidden_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "peer_reviews" smallint;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "peer_anonymous" boolean;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "peer_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "peer_released_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "peer_reviews_key" ON "core"."peer_reviews" ("tenant_id","assignment_id","reviewer_user_id","author_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "peer_reviews_assignment_idx" ON "core"."peer_reviews" ("tenant_id","assignment_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id","attempt_id") REFERENCES "core"."submission_attempts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_reviewer_user_id_fkey" FOREIGN KEY ("tenant_id","reviewer_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."peer_reviews" ADD CONSTRAINT "peer_reviews_tenant_id_hidden_by_user_id_fkey" FOREIGN KEY ("tenant_id","hidden_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_peer_check" CHECK ((peer_reviews is null) = (peer_anonymous is null) and (peer_reviews is null or (peer_reviews between 1 and 5 and submission_format in ('online', 'files', 'both'))) and (peer_started_at is null or peer_reviews is not null) and (peer_released_at is null or peer_started_at is not null));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."peer_reviews" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."peer_reviews" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."peer_reviews" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."peer_reviews" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."peer_reviews" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."peer_reviews" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "reviewer_user_id") or app.erasure_approved(tenant_id, "author_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."peer_reviews" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "reviewer_user_id") or app.erasure_approved(tenant_id, "author_user_id")));