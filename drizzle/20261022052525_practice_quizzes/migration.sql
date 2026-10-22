ALTER TABLE "core"."assignments" ADD COLUMN "quiz_practice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD COLUMN "tries" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD COLUMN "hints" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD COLUMN "revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."assignments" ADD CONSTRAINT "assignments_quiz_practice_check" CHECK (not quiz_practice or submission_format = 'quiz');--> statement-breakpoint
ALTER TABLE "core"."quiz_answers" ADD CONSTRAINT "quiz_answers_practice_check" CHECK (tries between 0 and 100 and hints between 0 and 10);