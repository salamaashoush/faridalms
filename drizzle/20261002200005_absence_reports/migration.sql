CREATE TABLE "core"."absence_reports" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"school_year_type" text DEFAULT 'school_year' NOT NULL,
	"student_user_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"span" daterange NOT NULL,
	"at" time,
	"reason_descriptor_id" uuid NOT NULL,
	"reason_ns" text GENERATED ALWAYS AS ('attendance_reason') STORED NOT NULL,
	"note" text,
	"file_id" uuid,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "absence_reports_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "absence_reports_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "absence_reports_version_check" CHECK (version > 0),
	CONSTRAINT "absence_reports_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "absence_reports_school_year_type_check" CHECK (school_year_type = 'school_year'),
	CONSTRAINT "absence_reports_span_check" CHECK (not isempty("span") and not lower_inf("span") and not upper_inf("span") and lower_inc("span") and not upper_inc("span")),
	CONSTRAINT "absence_reports_kind_check" CHECK (kind in ('absent', 'late', 'early') and (kind = 'absent') = (at is null)
        and (kind = 'absent' or upper(span) - lower(span) = 1)),
	CONSTRAINT "absence_reports_decision_check" CHECK (decision in ('pending', 'accepted', 'declined', 'withdrawn')
        and (decision in ('pending', 'withdrawn')) = (decided_at is null)),
	CONSTRAINT "absence_reports_note_check" CHECK (char_length(note) between 1 and 1000),
	CONSTRAINT "absence_reports_decision_note_check" CHECK (char_length(decision_note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "absence_reports_student_idx" ON "core"."absence_reports" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "absence_reports_open_idx" ON "core"."absence_reports" ("tenant_id","org_id") WHERE status = 'active' and decision = 'pending';--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_school_year_id_school_year_type__fkey" FOREIGN KEY ("tenant_id","school_year_id","school_year_type","school_year_id","org_id") REFERENCES "core"."academic_sessions"("tenant_id","id","type","school_year_id","org_id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_reported_by_user_id_fkey" FOREIGN KEY ("tenant_id","reported_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_decided_by_user_id_fkey" FOREIGN KEY ("tenant_id","decided_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_reason_descriptor_id_reason_ns_fkey" FOREIGN KEY ("tenant_id","reason_descriptor_id","reason_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."absence_reports" ADD CONSTRAINT "absence_reports_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id","file_id") REFERENCES "core"."files"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."absence_reports" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."absence_reports" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."absence_reports" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."absence_reports" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."absence_reports" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);