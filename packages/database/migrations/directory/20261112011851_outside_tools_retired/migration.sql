-- Outside tools are gone: the clients registered for them, the operators'
-- changes to those clients, and the integrations module in every plan and
-- entitlement.
DELETE FROM "changes" WHERE "subject_type" = 'integration_client';--> statement-breakpoint
UPDATE "school_plans" SET "modules" = array_remove("modules", 'integrations') WHERE 'integrations' = any ("modules");--> statement-breakpoint
UPDATE "school_entitlements" SET "modules" = array_remove("modules", 'integrations') WHERE 'integrations' = any ("modules");--> statement-breakpoint
DROP TABLE "integration_clients";--> statement-breakpoint
ALTER TABLE "changes" DROP CONSTRAINT "changes_subject_type_check", ADD CONSTRAINT "changes_subject_type_check" CHECK (subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain'));--> statement-breakpoint
ALTER TABLE "school_plans" DROP CONSTRAINT "school_plans_modules_check", ADD CONSTRAINT "school_plans_modules_check" CHECK (modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]);--> statement-breakpoint
ALTER TABLE "school_entitlements" DROP CONSTRAINT "school_entitlements_modules_check", ADD CONSTRAINT "school_entitlements_modules_check" CHECK (modules <@ array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards', 'elearning', 'early_years', 'coding', 'video', 'sso', 'sms']::text[]);