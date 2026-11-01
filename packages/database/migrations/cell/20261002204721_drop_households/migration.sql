ALTER POLICY "p_erase_update" ON "core"."contact_points" TO "retention" USING (app.erasure_approved(tenant_id, "user_id")) WITH CHECK (status = 'tobedeleted');--> statement-breakpoint
ALTER POLICY "p_erase_delete" ON "core"."contact_points" TO "retention" USING (status = 'tobedeleted' and (app.erasure_approved(tenant_id, "user_id")));--> statement-breakpoint
ALTER TABLE "core"."contact_points" DROP CONSTRAINT "contact_points_tenant_id_household_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."household_members" DROP CONSTRAINT "household_members_tenant_id_household_id_fkey";--> statement-breakpoint
DROP TABLE "core"."household_members";--> statement-breakpoint
DROP TABLE "core"."households";--> statement-breakpoint
ALTER TABLE "core"."contact_points" DROP CONSTRAINT "contact_points_owner_check";--> statement-breakpoint
ALTER TABLE "core"."contact_points" DROP COLUMN "household_id";--> statement-breakpoint
ALTER TABLE "core"."user_relationships" DROP COLUMN "lives_with";--> statement-breakpoint
ALTER TABLE "core"."contact_points" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "core"."contact_points_user_value_key";--> statement-breakpoint
CREATE UNIQUE INDEX "contact_points_user_value_key" ON "core"."contact_points" ("tenant_id","user_id","kind","normalized") WHERE status = 'active' and normalized is not null;--> statement-breakpoint
ALTER TABLE "core"."erasure_items" DROP CONSTRAINT "erasure_items_object_type_check", ADD CONSTRAINT "erasure_items_object_type_check" CHECK (object_type in ('file', 'document'));
