ALTER TABLE "core"."assignments" ADD COLUMN "quiz_bands" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD COLUMN "feedback_bands" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_quiz_bands_check" CHECK (jsonb_typeof(quiz_bands) = 'array' and jsonb_array_length(quiz_bands) <= 6);--> statement-breakpoint
ALTER TABLE "core"."lessons" ADD CONSTRAINT "lessons_feedback_bands_check" CHECK (jsonb_typeof(feedback_bands) = 'array' and jsonb_array_length(feedback_bands) <= 6);