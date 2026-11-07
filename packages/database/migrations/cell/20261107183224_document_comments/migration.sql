CREATE TABLE "core"."document_comments" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"edited_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_comments_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_comments_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_comments_version_check" CHECK (version > 0),
	CONSTRAINT "document_comments_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_comments_body_check" CHECK (char_length(body) between 1 and 2000),
	CONSTRAINT "document_comments_mentions_check" CHECK (cardinality(mentioned_user_ids) <= 10)
);
--> statement-breakpoint
ALTER TABLE "core"."document_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."document_threads" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"document_id" uuid NOT NULL,
	"part" text DEFAULT 'body' NOT NULL,
	"anchor" jsonb NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "document_threads_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "document_threads_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "document_threads_version_check" CHECK (version > 0),
	CONSTRAINT "document_threads_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "document_threads_part_check" CHECK (part ~ '^[a-z][a-z0-9_-]{0,39}$'),
	CONSTRAINT "document_threads_anchor_check" CHECK (jsonb_typeof(anchor) = 'object'),
	CONSTRAINT "document_threads_quote_check" CHECK (char_length(quote) <= 280),
	CONSTRAINT "document_threads_resolved_check" CHECK ((resolved_at is null) = (resolved_by_user_id is null))
);
--> statement-breakpoint
ALTER TABLE "core"."document_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_comments_thread_idx" ON "core"."document_comments" ("tenant_id","thread_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "document_threads_document_idx" ON "core"."document_threads" ("tenant_id","document_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."document_comments" ADD CONSTRAINT "document_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_comments" ADD CONSTRAINT "document_comments_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."document_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_comments" ADD CONSTRAINT "document_comments_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id","document_id") REFERENCES "core"."documents"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_threads" ADD CONSTRAINT "document_threads_tenant_id_resolved_by_user_id_fkey" FOREIGN KEY ("tenant_id","resolved_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_comments" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_comments" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_comments" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_comments" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_comments" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_threads" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_threads" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_threads" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_threads" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_threads" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);