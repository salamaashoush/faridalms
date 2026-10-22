CREATE TABLE "core"."standard_observations" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"student_user_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"class_id" uuid,
	"level" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"observed_by_user_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "standard_observations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "standard_observations_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "standard_observations_version_check" CHECK (version > 0),
	CONSTRAINT "standard_observations_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "standard_observations_level_check" CHECK (level in ('beginning', 'developing', 'secure')),
	CONSTRAINT "standard_observations_note_check" CHECK (char_length(note) <= 500)
);
--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "standard_observations_student_idx" ON "core"."standard_observations" ("tenant_id","student_user_id","standard_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "core"."standards"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."standard_observations" ADD CONSTRAINT "standard_observations_tenant_id_observed_by_user_id_fkey" FOREIGN KEY ("tenant_id","observed_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."standard_observations" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."standard_observations" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."standard_observations" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."standard_observations" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."standard_observations" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "core"."standard_observations" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "core"."standard_observations" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));