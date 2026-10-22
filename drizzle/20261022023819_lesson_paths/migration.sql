ALTER TABLE "core"."learning_modules" ADD COLUMN "prerequisite_score" smallint;--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD COLUMN "condition_lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD COLUMN "condition_at_least" smallint;--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD COLUMN "condition_below" smallint;--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_tenant_id_condition_lesson_id_fkey" FOREIGN KEY ("tenant_id","condition_lesson_id") REFERENCES "core"."lessons"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."learning_modules" ADD CONSTRAINT "learning_modules_prerequisite_score_check" CHECK (prerequisite_score is null or (prerequisite_module_id is not null and prerequisite_score between 1 and 100));--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_condition_check" CHECK (case when condition_lesson_id is null
        then condition_at_least is null and condition_below is null
        else condition_lesson_id <> id
          and (condition_at_least is not null or condition_below is not null)
          and coalesce(condition_at_least between 1 and 100, true)
          and coalesce(condition_below between 1 and 100, true)
          and coalesce(condition_at_least < condition_below, true) end);