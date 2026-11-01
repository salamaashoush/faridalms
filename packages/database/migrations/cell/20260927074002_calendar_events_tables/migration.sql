CREATE TABLE "core"."calendar_event_audiences" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"event_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"class_id" uuid,
	"grade_descriptor_id" uuid,
	"grade_ns" text DEFAULT 'grade_level' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_event_audiences_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_event_audiences_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_event_audiences_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_event_audiences_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_event_audiences_scope_check" CHECK (scope in ('school', 'staff', 'families', 'students', 'class', 'grade')),
	CONSTRAINT "calendar_event_audiences_grade_ns_check" CHECK (grade_ns = 'grade_level'),
	CONSTRAINT "calendar_event_audiences_target_check" CHECK ((scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."calendar_events" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"location" text,
	"provisional" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"author_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "calendar_events_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "calendar_events_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "calendar_events_version_check" CHECK (version > 0),
	CONSTRAINT "calendar_events_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "calendar_events_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "calendar_events_category_check" CHECK (category in ('general', 'meeting', 'trip', 'performance', 'sport', 'exam', 'celebration')),
	CONSTRAINT "calendar_events_location_check" CHECK (location is null or char_length(location) between 1 and 200),
	CONSTRAINT "calendar_events_ends_on_check" CHECK (ends_on >= starts_on),
	CONSTRAINT "calendar_events_times_check" CHECK ((start_time is null) = (end_time is null)
        and (start_time is null or ends_on > starts_on or end_time > start_time))
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "calendar_event_audiences_event_idx" ON "core"."calendar_event_audiences" ("tenant_id","event_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "calendar_events_org_idx" ON "core"."calendar_events" ("tenant_id","org_id","starts_on","ends_on") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "core"."calendar_events"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id","class_id") REFERENCES "core"."classes"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_event_audiences" ADD CONSTRAINT "calendar_event_audiences_tenant_id_grade_descriptor_id_gra_fkey" FOREIGN KEY ("tenant_id","grade_descriptor_id","grade_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_author_user_id_fkey" FOREIGN KEY ("tenant_id","author_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_event_audiences" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_event_audiences" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."calendar_events" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."calendar_events" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."calendar_events" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."calendar_events" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."calendar_events" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);