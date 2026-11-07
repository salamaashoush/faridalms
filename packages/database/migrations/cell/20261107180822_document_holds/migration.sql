CREATE TABLE "core"."document_holds" (
	"tenant_id" uuid,
	"host_type" text,
	"host_id" uuid,
	"user_id" uuid NOT NULL,
	"held_since" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_holds_pkey" PRIMARY KEY("tenant_id","host_type","host_id"),
	CONSTRAINT "document_holds_host_type_check" CHECK (host_type ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "document_holds_expires_at_check" CHECK (expires_at >= held_since)
);
--> statement-breakpoint
ALTER TABLE "core"."document_holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_holds_user_idx" ON "core"."document_holds" ("tenant_id","user_id");--> statement-breakpoint
ALTER TABLE "core"."document_holds" ADD CONSTRAINT "document_holds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."document_holds" ADD CONSTRAINT "document_holds_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id","user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."document_holds" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."document_holds" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."document_holds" AS PERMISSIVE FOR SELECT TO "app", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."document_holds" AS PERMISSIVE FOR INSERT TO "app", "worker" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_update" ON "core"."document_holds" AS PERMISSIVE FOR UPDATE TO "app", "worker" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_delete" ON "core"."document_holds" AS PERMISSIVE FOR DELETE TO "retention" USING (expires_at < statement_timestamp() or app.erasure_approved(tenant_id, "user_id"));