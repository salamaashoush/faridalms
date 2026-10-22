ALTER TABLE "core"."paced_lessons" ADD COLUMN "shown_block_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD COLUMN "shown_student_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_tenant_id_shown_student_id_fkey" FOREIGN KEY ("tenant_id","shown_student_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."paced_lessons" ADD CONSTRAINT "paced_lessons_shown_check" CHECK ((shown_block_id is null) = (shown_student_id is null));