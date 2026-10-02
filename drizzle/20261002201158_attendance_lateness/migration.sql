ALTER TABLE "core"."attendance_settings" ADD COLUMN "late_after_minutes" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD COLUMN "register_closes_minutes" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD CONSTRAINT "attendance_settings_lateness_check" CHECK (late_after_minutes between 0 and 60
        and register_closes_minutes between 5 and 240
        and late_after_minutes < register_closes_minutes);