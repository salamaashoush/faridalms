ALTER TABLE "core"."message_contacts" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD COLUMN "complaint_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "message_contacts_merged_idx" ON "core"."message_contacts" ("tenant_id","merged_into_id") WHERE merged_into_id is not null;--> statement-breakpoint
ALTER TABLE "core"."message_contacts" ADD CONSTRAINT "message_contacts_merged_check" CHECK ((merged_into_id is null) = (merged_at is null) and merged_into_id is distinct from id);--> statement-breakpoint
ALTER POLICY "p_erase_update" ON "core"."message_contacts" TO "retention" USING (app.erasure_approved(tenant_id, "id") or app.erasure_approved(tenant_id, "user_id") or app.erasure_approved(tenant_id, "merged_into_id")) WITH CHECK (status = 'tobedeleted');