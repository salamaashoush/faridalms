CREATE TABLE "core"."discussion_posts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"assignment_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"parent_post_id" uuid,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"edited_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"redacted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "discussion_posts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "discussion_posts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "discussion_posts_version_check" CHECK (version > 0),
	CONSTRAINT "discussion_posts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "discussion_posts_content_check" CHECK (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 131072),
	CONSTRAINT "discussion_posts_plain_text_check" CHECK (char_length(plain_text) <= 20000),
	CONSTRAINT "discussion_posts_hidden_check" CHECK ((hidden_at is null) = (hidden_by_user_id is null)),
	CONSTRAINT "discussion_posts_redacted_check" CHECK (redacted_at is null or (content = '{}' and plain_text = ''))
);
--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "discussion_post_first" boolean;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "discussion_replies" smallint;--> statement-breakpoint
CREATE INDEX "discussion_posts_assignment_idx" ON "core"."discussion_posts" ("tenant_id","assignment_id","created_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "core"."assignments"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_parent_post_id_fkey" FOREIGN KEY ("tenant_id","parent_post_id") REFERENCES "core"."discussion_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_posts" ADD CONSTRAINT "discussion_posts_tenant_id_hidden_by_user_id_fkey" FOREIGN KEY ("tenant_id","hidden_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_discussion_check" CHECK ((submission_format = 'discussion') = (discussion_post_first is not null and discussion_replies is not null) and (discussion_replies is null or discussion_replies between 0 and 5));--> statement-breakpoint
ALTER TABLE "core"."assignments" DROP CONSTRAINT "assignments_submission_format_check", ADD CONSTRAINT "assignments_submission_format_check" CHECK (submission_format in ('online', 'files', 'both', 'none', 'quiz', 'discussion'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."discussion_posts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."discussion_posts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."discussion_posts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."discussion_posts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."discussion_posts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."discussion_posts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "author_user_id")) WITH CHECK (redacted_at is not null);