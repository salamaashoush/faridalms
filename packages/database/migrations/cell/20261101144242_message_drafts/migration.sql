CREATE TABLE "core"."message_drafts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"kind" text,
	"recipient_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"student_user_id" uuid,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "message_drafts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "message_drafts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "message_drafts_version_check" CHECK (version > 0),
	CONSTRAINT "message_drafts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "message_drafts_kind_check" CHECK (kind in ('direct', 'group', 'family')),
	CONSTRAINT "message_drafts_start_check" CHECK ((thread_id is null) = (kind is not null)),
	CONSTRAINT "message_drafts_reply_check" CHECK (thread_id is null or (cardinality(recipient_ids) = 0 and student_user_id is null and subject is null)),
	CONSTRAINT "message_drafts_recipient_ids_check" CHECK (cardinality(recipient_ids) <= 50),
	CONSTRAINT "message_drafts_subject_check" CHECK (char_length(subject) between 1 and 200),
	CONSTRAINT "message_drafts_body_check" CHECK (char_length(body) <= 5000)
);
--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "message_drafts_reply_key" ON "core"."message_drafts" ("tenant_id","thread_id","user_id") WHERE status = 'active' and thread_id is not null;--> statement-breakpoint
CREATE INDEX "message_drafts_user_idx" ON "core"."message_drafts" ("tenant_id","user_id","org_id","date_last_modified") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_thread_id_fkey" FOREIGN KEY ("tenant_id","thread_id") REFERENCES "core"."message_threads"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_drafts" ADD CONSTRAINT "message_drafts_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."message_threads" DROP CONSTRAINT "message_threads_student_check", ADD CONSTRAINT "message_threads_student_check" CHECK ((kind = 'family' and student_user_id is not null) or kind in ('mailbox', 'direct') or (student_user_id is null));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."message_drafts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."message_drafts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."message_drafts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."message_drafts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."message_drafts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."message_drafts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id") or app.erasure_approved(tenant_id, "student_user_id") or app.erasure_listed(tenant_id, 'message_thread', "thread_id")) WITH CHECK (status = 'tobedeleted');