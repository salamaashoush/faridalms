CREATE TABLE "core"."discussion_likes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "discussion_likes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "discussion_likes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "discussion_likes_version_check" CHECK (version > 0),
	CONSTRAINT "discussion_likes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD COLUMN "module_id" uuid;--> statement-breakpoint
CREATE INDEX "assignments_module_idx" ON "core"."assignments" ("tenant_id","module_id") WHERE status = 'active' and module_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_likes_key" ON "core"."discussion_likes" ("tenant_id","post_id","user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_tenant_id_module_id_fkey" FOREIGN KEY ("tenant_id","module_id") REFERENCES "core"."learning_modules"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ADD CONSTRAINT "discussion_likes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ADD CONSTRAINT "discussion_likes_tenant_id_post_id_fkey" FOREIGN KEY ("tenant_id","post_id") REFERENCES "core"."discussion_posts"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."discussion_likes" ADD CONSTRAINT "discussion_likes_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_module_check" CHECK (module_id is null or submission_format = 'discussion');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."discussion_likes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."discussion_likes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."discussion_likes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."discussion_likes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."discussion_likes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."discussion_likes" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."discussion_likes" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));