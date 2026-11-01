CREATE TABLE "core"."message_contacts" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"email" text,
	"phone" text,
	"phone_normalized" text,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"user_id" uuid,
	"linked_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "message_contacts_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "message_contacts_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "message_contacts_version_check" CHECK (version > 0),
	CONSTRAINT "message_contacts_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "message_contacts_email_check" CHECK (email is null or (char_length(email) between 3 and 254 and email = lower(email) and strpos(email, '@') > 1)),
	CONSTRAINT "message_contacts_phone_check" CHECK (char_length(phone) between 1 and 40),
	CONSTRAINT "message_contacts_phone_normalized_check" CHECK (phone_normalized ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "message_contacts_reach_check" CHECK (status = 'tobedeleted' or email is not null or phone is not null),
	CONSTRAINT "message_contacts_display_name_check" CHECK (char_length(display_name) <= 120 and (status = 'tobedeleted' or char_length(display_name) >= 1)),
	CONSTRAINT "message_contacts_locale_check" CHECK (locale in ('en', 'ar')),
	CONSTRAINT "message_contacts_linked_check" CHECK ((user_id is null) = (linked_at is null))
);
--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD COLUMN "builtin_key" text;--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD COLUMN "subject_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD COLUMN "mailbox" text;--> statement-breakpoint
ALTER TABLE "core"."messages" ADD COLUMN "kind" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."messages" ADD COLUMN "author_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."messages" ADD COLUMN "details" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."messages" ADD COLUMN "redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "phone_normalized" text;--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD COLUMN "thread_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD COLUMN "reply_key" bytea;--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ALTER COLUMN "subject_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."message_threads" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."messages" ALTER COLUMN "author_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."thread_members" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."document_templates" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_builtin_key" ON "core"."document_templates" ("tenant_id","org_id","builtin_key") WHERE builtin_key is not null;--> statement-breakpoint
CREATE INDEX "erasure_approvals_contact_idx" ON "core"."erasure_approvals" ("tenant_id","subject_contact_id") WHERE subject_contact_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_contacts_email_key" ON "core"."message_contacts" ("tenant_id","email") WHERE status = 'active' and email is not null;--> statement-breakpoint
CREATE INDEX "message_contacts_user_idx" ON "core"."message_contacts" ("tenant_id","user_id") WHERE status = 'active' and user_id is not null;--> statement-breakpoint
CREATE INDEX "message_contacts_phone_idx" ON "core"."message_contacts" ("tenant_id","phone_normalized") WHERE status = 'active' and phone_normalized is not null;--> statement-breakpoint
CREATE INDEX "message_threads_mailbox_idx" ON "core"."message_threads" ("tenant_id","org_id","mailbox","last_message_at") WHERE status = 'active' and mailbox is not null;--> statement-breakpoint
CREATE INDEX "message_threads_student_idx" ON "core"."message_threads" ("tenant_id","mailbox","student_user_id") WHERE status = 'active' and student_user_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_email_key" ON "core"."messages" ("tenant_id",(details ->> 'emailId')) WHERE details ? 'emailId';--> statement-breakpoint
CREATE INDEX "messages_logged_idx" ON "core"."messages" ("tenant_id",(details ->> 'studentId'),(details ->> 'on')) WHERE status = 'active' and details ? 'studentId';--> statement-breakpoint
CREATE INDEX "site_enquiries_phone_idx" ON "core"."site_enquiries" ("tenant_id","org_id","phone_normalized") WHERE status = 'active' and phone_normalized is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "site_enquiries_thread_key" ON "core"."site_enquiries" ("tenant_id","thread_id") WHERE thread_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_members_contact_key" ON "core"."thread_members" ("tenant_id","thread_id","contact_id") WHERE status = 'active' and left_at is null and contact_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_members_reply_key" ON "core"."thread_members" ("tenant_id","reply_key") WHERE reply_key is not null;--> statement-breakpoint
CREATE INDEX "thread_members_contact_idx" ON "core"."thread_members" ("tenant_id","contact_id") WHERE status = 'active' and contact_id is not null;--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD CONSTRAINT "message_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD CONSTRAINT "message_contacts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_builtin_check" CHECK ((builtin_key is null) = (owner_user_id is not null));--> statement-breakpoint
ALTER TABLE "core"."document_templates" ADD CONSTRAINT "document_templates_builtin_key_check" CHECK (builtin_key ~ '^[a-z][a-z0-9_]{1,62}$');--> statement-breakpoint
ALTER TABLE "core"."erasure_approvals" ADD CONSTRAINT "erasure_approvals_subject_check" CHECK (num_nonnulls(subject_user_id, subject_contact_id) = 1);--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_mailbox_check" CHECK (mailbox in ('admissions', 'attendance'));--> statement-breakpoint
ALTER TABLE "core"."message_threads" ADD CONSTRAINT "message_threads_mailbox_kind_check" CHECK ((kind = 'mailbox') = (mailbox is not null));--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_kind_check" CHECK (kind in ('message', 'note', 'call', 'meeting', 'email', 'event', 'held'));--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_author_check" CHECK (num_nonnulls(author_user_id, author_contact_id) = case when kind = 'message' then 1 else num_nonnulls(author_user_id) end
        and (kind not in ('note', 'call', 'meeting', 'email') or author_user_id is not null));--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_details_check" CHECK (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192);--> statement-breakpoint
ALTER TABLE "core"."messages" ADD CONSTRAINT "messages_redacted_check" CHECK (redacted_at is null or (body = '' and details = '{}'));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" ADD CONSTRAINT "site_enquiries_phone_normalized_check" CHECK (phone_normalized ~ '^\+[1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_member_check" CHECK (user_id is not null or contact_id is not null);--> statement-breakpoint
ALTER TABLE "core"."thread_members" ADD CONSTRAINT "thread_members_reply_key_check" CHECK (reply_key is null or (contact_id is not null and octet_length(reply_key) = 32));--> statement-breakpoint
ALTER TABLE "core"."erasure_items" DROP CONSTRAINT "erasure_items_object_type_check", ADD CONSTRAINT "erasure_items_object_type_check" CHECK (object_type in ('file', 'document', 'message_thread', 'site_enquiry'));--> statement-breakpoint
ALTER TABLE "core"."message_threads" DROP CONSTRAINT "message_threads_kind_check", ADD CONSTRAINT "message_threads_kind_check" CHECK (kind in ('direct', 'group', 'family', 'mailbox'));--> statement-breakpoint
ALTER TABLE "core"."message_threads" DROP CONSTRAINT "message_threads_student_check", ADD CONSTRAINT "message_threads_student_check" CHECK ((kind = 'family' and student_user_id is not null) or (kind = 'mailbox') or (student_user_id is null));--> statement-breakpoint
ALTER TABLE "core"."messages" DROP CONSTRAINT "messages_body_check", ADD CONSTRAINT "messages_body_check" CHECK (char_length(body) <= 5000 and (redacted_at is not null or kind in ('event', 'call', 'meeting', 'email') or char_length(body) >= 1));--> statement-breakpoint
ALTER TABLE "core"."thread_members" DROP CONSTRAINT "thread_members_role_check", ADD CONSTRAINT "thread_members_role_check" CHECK (role in ('owner', 'member', 'reader'));--> statement-breakpoint
ALTER TABLE "core"."document_templates" DROP CONSTRAINT "document_templates_kind_check", ADD CONSTRAINT "document_templates_kind_check" CHECK (kind in ('lesson', 'assignment', 'unit_plan', 'news', 'announcement', 'event', 'consent_form', 'module', 'message'));--> statement-breakpoint
ALTER TABLE "core"."site_enquiries" DROP CONSTRAINT "site_enquiries_reach_check", ADD CONSTRAINT "site_enquiries_reach_check" CHECK (status = 'tobedeleted' or email <> '' or phone <> '');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."message_contacts" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."message_contacts" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."message_contacts" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."message_contacts" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."message_contacts" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."message_contacts" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "id") or app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."message_threads" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'message_thread', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."messages" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "author_user_id") or app.erasure_approved(tenant_id, "author_contact_id")
        or app.erasure_listed(tenant_id, 'message_thread', "thread_id")
        or exists (select 1 from core.message_contacts c where c.tenant_id = messages.tenant_id
          and c.id = messages.author_contact_id and app.erasure_approved(c.tenant_id, c.user_id))) WITH CHECK (redacted_at is not null);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."site_enquiries" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_listed(tenant_id, 'site_enquiry', "id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."thread_members" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "user_id") or app.erasure_approved(tenant_id, "contact_id") or app.erasure_listed(tenant_id, 'message_thread', "thread_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
ALTER POLICY "p_site_insert" ON "core"."site_enquiries" TO "site" WITH CHECK (status = 'active' and source = 'website' and state = 'open'
        and closed_reason is null and assignee_user_id is null and first_responded_at is null
        and created_by_user_id is null and family_user_id is null and applicant_user_id is null
        and thread_id is null and handled_at is null);