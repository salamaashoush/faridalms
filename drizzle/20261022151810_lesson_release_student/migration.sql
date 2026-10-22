ALTER TABLE "core"."lesson_releases" ADD COLUMN "student_user_id" uuid;--> statement-breakpoint
DROP INDEX "core"."lesson_releases_key";--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_releases_key" ON "core"."lesson_releases" ("tenant_id","lesson_id","class_id") WHERE status = 'active' and student_user_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_releases_student_key" ON "core"."lesson_releases" ("tenant_id","lesson_id","class_id","student_user_id") WHERE status = 'active' and student_user_id is not null;--> statement-breakpoint
ALTER TABLE "core"."lesson_releases" ADD CONSTRAINT "lesson_releases_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;