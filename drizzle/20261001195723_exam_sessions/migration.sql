CREATE TABLE "core"."exam_boards" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"title_en" text,
	"title_ar" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "exam_boards_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "exam_boards_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "exam_boards_version_check" CHECK (version > 0),
	CONSTRAINT "exam_boards_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "exam_boards_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "exam_boards_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "exam_boards_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1)
);
--> statement-breakpoint
ALTER TABLE "core"."exam_boards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."exam_sessions" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"official_series" text,
	"board_id" uuid,
	"title_en" text,
	"title_ar" text,
	"sits_in" date NOT NULL,
	"keep_until" date,
	"declaration_required" boolean DEFAULT true NOT NULL,
	"ai_evidence_required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "exam_sessions_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "exam_sessions_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "exam_sessions_version_check" CHECK (version > 0),
	CONSTRAINT "exam_sessions_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "exam_sessions_board_check" CHECK (num_nonnulls(official_series, board_id) = 1),
	CONSTRAINT "exam_sessions_official_series_check" CHECK (official_series ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
	CONSTRAINT "exam_sessions_title_en_check" CHECK (char_length(title_en) between 1 and 120),
	CONSTRAINT "exam_sessions_title_ar_check" CHECK (char_length(title_ar) between 1 and 120),
	CONSTRAINT "exam_sessions_title_check" CHECK (official_series is not null or num_nonnulls(title_en, title_ar) >= 1),
	CONSTRAINT "exam_sessions_sits_in_check" CHECK (extract(day from sits_in) = 1),
	CONSTRAINT "exam_sessions_keep_until_check" CHECK ((official_series is not null or keep_until is not null) and (keep_until is null or keep_until > sits_in))
);
--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "exam_boards_org_idx" ON "core"."exam_boards" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "exam_sessions_official_key" ON "core"."exam_sessions" ("tenant_id","org_id","official_series") WHERE status = 'active' and official_series is not null;--> statement-breakpoint
CREATE INDEX "exam_sessions_org_idx" ON "core"."exam_sessions" ("tenant_id","org_id","sits_in") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "core"."exam_boards" ADD CONSTRAINT "exam_boards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."exam_boards" ADD CONSTRAINT "exam_boards_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_tenant_id_board_id_fkey" FOREIGN KEY ("tenant_id","board_id") REFERENCES "core"."exam_boards"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."exam_boards" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."exam_boards" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."exam_boards" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."exam_boards" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."exam_boards" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."exam_sessions" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."exam_sessions" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."exam_sessions" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."exam_sessions" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."exam_sessions" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);