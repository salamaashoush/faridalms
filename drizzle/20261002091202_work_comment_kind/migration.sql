ALTER TABLE "core"."work_comments" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD COLUMN "criterion_id" text;--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD CONSTRAINT "work_comments_kind_check" CHECK (kind in ('fix', 'think', 'next'));--> statement-breakpoint
ALTER TABLE "core"."work_comments" ADD CONSTRAINT "work_comments_criterion_id_check" CHECK (char_length(criterion_id) between 1 and 40);