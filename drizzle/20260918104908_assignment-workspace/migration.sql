CREATE TYPE "assignment_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "file_purpose" AS ENUM('assignment_resource', 'submission_attachment');--> statement-breakpoint
CREATE TYPE "file_state" AS ENUM('initiated', 'ready', 'rejected');--> statement-breakpoint
CREATE TYPE "late_policy" AS ENUM('not_accepted', 'accepted', 'accepted_with_deduction');--> statement-breakpoint
CREATE TYPE "resubmission_policy" AS ENUM('not_allowed', 'until_due', 'until_close');--> statement-breakpoint
CREATE TYPE "submission_format" AS ENUM('written', 'files', 'written_and_files');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"attempt_id" uuid NOT NULL UNIQUE,
	"score" integer NOT NULL,
	"effective_score" integer NOT NULL,
	"rubric_scores" jsonb DEFAULT '[]' NOT NULL,
	"feedback" jsonb,
	"feedback_text" text,
	"graded_by_id" uuid,
	"graded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "assessments_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_recipients" (
	"assignment_id" uuid,
	"student_id" uuid,
	"source" varchar(16) DEFAULT 'class' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY("assignment_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "assignment_resources" (
	"assignment_id" uuid,
	"file_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "assignment_resources_pkey" PRIMARY KEY("assignment_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "private_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"name" varchar(255) NOT NULL,
	"media_type" varchar(128) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64),
	"state" "file_state" DEFAULT 'initiated'::"file_state" NOT NULL,
	"storage_key" text NOT NULL UNIQUE,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_files_size_check" CHECK ("size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "student_group_members" (
	"group_id" uuid,
	"student_id" uuid,
	CONSTRAINT "student_group_members_pkey" PRIMARY KEY("group_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "student_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"class_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_groups_class_name_key" UNIQUE("class_id","name")
);
--> statement-breakpoint
CREATE TABLE "submission_attempt_files" (
	"attempt_id" uuid,
	"file_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "submission_attempt_files_pkey" PRIMARY KEY("attempt_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"submission_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"source_revision" integer NOT NULL,
	"content" jsonb,
	"plain_text" text,
	"is_late" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_id" uuid,
	CONSTRAINT "submission_attempts_number_key" UNIQUE("submission_id","number"),
	CONSTRAINT "submission_attempts_revision_key" UNIQUE("submission_id","source_revision"),
	CONSTRAINT "submission_attempts_number_check" CHECK ("number" > 0)
);
--> statement-breakpoint
CREATE TABLE "submission_draft_files" (
	"submission_id" uuid,
	"file_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "submission_draft_files_pkey" PRIMARY KEY("submission_id","file_id")
);
--> statement-breakpoint
DROP TABLE "submission_files";--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "instructions" jsonb;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "status" "assignment_status" DEFAULT 'published'::"assignment_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "available_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "late_policy" "late_policy" DEFAULT 'not_accepted'::"late_policy" NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "late_deduction_percent" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "submission_format" "submission_format" DEFAULT 'written'::"submission_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "max_attachments" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "max_attachment_bytes" integer DEFAULT 10485760 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "resubmission" "resubmission_policy" DEFAULT 'not_allowed'::"resubmission_policy" NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "rubric" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "updated_by_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "current_attempt_id" uuid;--> statement-breakpoint
CREATE INDEX "assignment_recipients_student_idx" ON "assignment_recipients" ("student_id");--> statement-breakpoint
CREATE INDEX "assignment_resources_file_idx" ON "assignment_resources" ("file_id");--> statement-breakpoint
CREATE INDEX "assignments_status_idx" ON "assignments" ("status","due_at");--> statement-breakpoint
CREATE INDEX "private_files_owner_idx" ON "private_files" ("owner_id","state");--> statement-breakpoint
CREATE INDEX "submission_attempt_files_file_idx" ON "submission_attempt_files" ("file_id");--> statement-breakpoint
CREATE INDEX "submission_draft_files_file_idx" ON "submission_draft_files" ("file_id");--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_attempt_id_submission_attempts_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "submission_attempts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_graded_by_id_users_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_assignment_id_assignments_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_resources" ADD CONSTRAINT "assignment_resources_assignment_id_assignments_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_resources" ADD CONSTRAINT "assignment_resources_file_id_private_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "private_files"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "private_files" ADD CONSTRAINT "private_files_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_group_id_student_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "submission_attempt_files" ADD CONSTRAINT "submission_attempt_files_attempt_id_submission_attempts_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "submission_attempts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submission_attempt_files" ADD CONSTRAINT "submission_attempt_files_file_id_private_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "private_files"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_submitted_by_id_users_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "submission_draft_files" ADD CONSTRAINT "submission_draft_files_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submission_draft_files" ADD CONSTRAINT "submission_draft_files_file_id_private_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "private_files"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_revision_check" CHECK ("revision" > 0);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_deduction_check" CHECK ("late_deduction_percent" between 0 and 100);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_attachments_check" CHECK ("max_attachments" between 0 and 10);--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_revision_check" CHECK ("revision" > 0);