CREATE TABLE "health"."requested_changes" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"request_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"target" text NOT NULL,
	"kind_descriptor_id" uuid,
	"kind_ns" text GENERATED ALWAYS AS ('health_record_kind') STORED NOT NULL,
	"record_id" uuid,
	"relationship_id" uuid,
	"key_purpose" text GENERATED ALWAYS AS ('health') STORED NOT NULL,
	"key_version" integer NOT NULL,
	"ciphertext" bytea NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"date_last_modified" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "requested_changes_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "requested_changes_tenant_id_request_id_key" UNIQUE("tenant_id","request_id"),
	CONSTRAINT "requested_changes_status_check" CHECK (status in ('active', 'tobedeleted')),
	CONSTRAINT "requested_changes_version_check" CHECK (version > 0),
	CONSTRAINT "requested_changes_metadata_check" CHECK (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
	CONSTRAINT "requested_changes_target_check" CHECK (target in ('record', 'contact')),
	CONSTRAINT "requested_changes_shape_check" CHECK ((target = 'record') = (kind_descriptor_id is not null) and (target = 'contact') = (relationship_id is not null) and (record_id is null or target = 'record')),
	CONSTRAINT "requested_changes_ciphertext_check" CHECK (octet_length(ciphertext) between 29 and 65565),
	CONSTRAINT "requested_changes_metadata_empty_check" CHECK (metadata = '{}')
);
--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD COLUMN "topic" text;--> statement-breakpoint
CREATE INDEX "requested_changes_student_idx" ON "health"."requested_changes" ("tenant_id","student_user_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "core"."records_requests"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_requested_by_user_id_fkey" FOREIGN KEY ("tenant_id","requested_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_kind_descriptor_id_kind_ns_fkey" FOREIGN KEY ("tenant_id","kind_descriptor_id","kind_ns") REFERENCES "core"."descriptors"("tenant_id","id","namespace");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_record_id_fkey" FOREIGN KEY ("tenant_id","record_id") REFERENCES "health"."records"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_relationship_id_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "core"."user_relationships"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "health"."requested_changes" ADD CONSTRAINT "requested_changes_tenant_id_key_purpose_key_version_fkey" FOREIGN KEY ("tenant_id","key_purpose","key_version") REFERENCES "core"."tenant_keys"("tenant_id","purpose","key_version");--> statement-breakpoint
ALTER TABLE "core"."records_requests" ADD CONSTRAINT "records_requests_topic_check" CHECK (topic is null or (topic in ('health') and kind = 'correction'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "health"."requested_changes" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "health"."requested_changes" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "health"."requested_changes" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "health"."requested_changes" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "health"."requested_changes" AS PERMISSIVE FOR UPDATE TO "app", "cell_io", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "purpose_gate" ON "health"."requested_changes" AS RESTRICTIVE FOR ALL TO public USING ((select current_setting('app.purpose', true)) = 'health') WITH CHECK ((select current_setting('app.purpose', true)) = 'health');--> statement-breakpoint
CREATE POLICY "p_erase_update" ON "health"."requested_changes" AS PERMISSIVE FOR UPDATE TO "retention" USING (app.erasure_approved(tenant_id, "student_user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
CREATE POLICY "p_erase_delete" ON "health"."requested_changes" AS PERMISSIVE FOR DELETE TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "student_user_id")));