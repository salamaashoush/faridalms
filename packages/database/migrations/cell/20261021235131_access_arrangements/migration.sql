CREATE TABLE "core"."access_arrangements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"extra_time" smallint DEFAULT 0 NOT NULL,
	"unlimited_time" boolean DEFAULT false NOT NULL,
	"read_aloud" boolean DEFAULT false NOT NULL,
	"fewer_choices" boolean DEFAULT false NOT NULL,
	"extension_days" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "access_arrangements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "access_arrangements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "access_arrangements_version_check" CHECK (version > 0),
	CONSTRAINT "access_arrangements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "access_arrangements_extra_time_check" CHECK (extra_time in (0, 10, 25, 50, 100)),
	CONSTRAINT "access_arrangements_extension_days_check" CHECK (extension_days between 0 and 14)
);
--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD COLUMN "due_arranged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "access_arrangements_key" ON "core"."access_arrangements" ("tenant_id","org_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ADD CONSTRAINT "access_arrangements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ADD CONSTRAINT "access_arrangements_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."access_arrangements" ADD CONSTRAINT "access_arrangements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."assignment_recipients" ADD CONSTRAINT "assignment_recipients_due_arranged_check" CHECK (not due_arranged or due_at is not null);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."access_arrangements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."access_arrangements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."access_arrangements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."access_arrangements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."access_arrangements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."access_arrangements" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."access_arrangements" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));