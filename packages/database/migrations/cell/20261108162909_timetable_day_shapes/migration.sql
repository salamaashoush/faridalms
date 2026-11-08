ALTER TABLE "core"."calendar_dates" ADD COLUMN "runs_as" smallint;--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD COLUMN "bell_schedule_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "class_periods_extra_code_key" ON "core"."class_periods" ("tenant_id","bell_schedule_id","code") WHERE status = 'active' and bell_schedule_id is not null;--> statement-breakpoint
ALTER TABLE "core"."calendar_dates" ADD CONSTRAINT "calendar_dates_runs_as_check" CHECK (runs_as between 1 and 28);--> statement-breakpoint
ALTER TABLE "core"."class_periods" ADD CONSTRAINT "class_periods_extra_check" CHECK (bell_schedule_id is null or not official_attendance);--> statement-breakpoint
ALTER TABLE "core"."bell_schedules" DROP CONSTRAINT "bell_schedules_times_check", ADD CONSTRAINT "bell_schedules_times_check" CHECK (jsonb_typeof(times) = 'array' and jsonb_array_length(times) between 0 and 50);