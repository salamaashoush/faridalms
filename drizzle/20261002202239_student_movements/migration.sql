CREATE TABLE "core"."student_movements" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"day_on" date NOT NULL,
	"direction" text NOT NULL,
	"at" time NOT NULL,
	"reason_descriptor_id" uuid,
	"reason_ns" text GENERATED ALWAYS AS ('attendance_reason') STORED NOT NULL,
	"collected_by_user_id" uuid,
	"collected_by_name" text,
	"note" text,
	"recorded_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "student_movements_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "student_movements_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "student_movements_version_check" CHECK (version > 0),
	CONSTRAINT "student_movements_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "student_movements_direction_check" CHECK (direction in ('in', 'out')
        and (direction = 'out' or (collected_by_user_id is null and collected_by_name is null))),
	CONSTRAINT "student_movements_collected_by_name_check" CHECK (char_length(collected_by_name) between 1 and 120),
	CONSTRAINT "student_movements_note_check" CHECK (char_length(note) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "core"."student_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "student_movements_day_idx" ON "core"."student_movements" ("tenant_id","org_id","day_on") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_reason_descriptor_id_reason_ns_fkey" FOREIGN KEY ("tenant_id","reason_descriptor_id","reason_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_collected_by_user_id_fkey" FOREIGN KEY ("tenant_id","collected_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."student_movements" ADD CONSTRAINT "student_movements_tenant_id_recorded_by_user_id_fkey" FOREIGN KEY ("tenant_id","recorded_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."student_movements" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."student_movements" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."student_movements" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."student_movements" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."student_movements" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);