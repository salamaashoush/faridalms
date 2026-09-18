ALTER TABLE "enrolments" DROP CONSTRAINT "enrolments_student_class_key";--> statement-breakpoint
CREATE UNIQUE INDEX "enrolments_open_student_class_idx" ON "enrolments" ("student_id","class_id") WHERE "until" is null;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_dates_check" CHECK ("until" is null or "since" <= "until");