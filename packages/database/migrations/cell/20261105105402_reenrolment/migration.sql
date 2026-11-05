ALTER TABLE "core"."academic_sessions" ADD COLUMN "reenrolment_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD COLUMN "next_year_intention" text;--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD COLUMN "intention_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD COLUMN "intention_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_next_year_intention_check" CHECK (next_year_intention in ('returning', 'undecided', 'leaving'));--> statement-breakpoint
ALTER TABLE "core"."student_school_years" ADD CONSTRAINT "student_school_years_intention_recorded_check" CHECK ((next_year_intention is null) = (intention_at is null));