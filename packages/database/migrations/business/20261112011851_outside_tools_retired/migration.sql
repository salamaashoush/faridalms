-- The integrations module is gone with the outside tools it switched on.
-- Plan versions stop naming it before the checks drop it; an add-on or
-- override sold for it has no module left to grant, so one stops the
-- migration for the operator to settle.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "add_on_versions" WHERE "module" = 'integrations')
     OR EXISTS (SELECT 1 FROM "subscription_overrides" WHERE "module" = 'integrations') THEN
    RAISE EXCEPTION 'an add-on or subscription override still names the integrations module';
  END IF;
END $$;--> statement-breakpoint
UPDATE "plan_versions" SET "modules" = array_remove("modules", 'integrations') WHERE 'integrations' = any ("modules");--> statement-breakpoint
ALTER TABLE "add_on_versions" DROP CONSTRAINT "add_on_versions_module_check", ADD CONSTRAINT "add_on_versions_module_check" CHECK (module is null or module = any (array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]));--> statement-breakpoint
ALTER TABLE "plan_versions" DROP CONSTRAINT "plan_versions_modules_check", ADD CONSTRAINT "plan_versions_modules_check" CHECK (modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]);--> statement-breakpoint
ALTER TABLE "subscription_overrides" DROP CONSTRAINT "subscription_overrides_module_check", ADD CONSTRAINT "subscription_overrides_module_check" CHECK (module is null or module = any (array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]));