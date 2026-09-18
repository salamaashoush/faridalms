CREATE TYPE "learning_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "file_purpose" ADD VALUE 'lesson_media';--> statement-breakpoint
CREATE TABLE "learning_modules" (
	"id" uuid PRIMARY KEY,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"summary" varchar(500) DEFAULT '' NOT NULL,
	"status" "learning_status" DEFAULT 'draft'::"learning_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"author_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_modules_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_files" (
	"lesson_id" uuid,
	"file_id" uuid,
	CONSTRAINT "lesson_files_pkey" PRIMARY KEY("lesson_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_key" UNIQUE("lesson_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY,
	"module_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" varchar(160) NOT NULL,
	"document" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "school_features" (
	"key" varchar(40) PRIMARY KEY,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "learning_modules_class_idx" ON "learning_modules" ("class_id","status");--> statement-breakpoint
CREATE INDEX "lesson_progress_student_idx" ON "lesson_progress" ("student_id");--> statement-breakpoint
CREATE INDEX "lessons_module_idx" ON "lessons" ("module_id","position");--> statement-breakpoint
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_subject_id_subjects_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_lesson_id_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_file_id_private_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "private_files"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_learning_modules_id_fkey" FOREIGN KEY ("module_id") REFERENCES "learning_modules"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_features" ADD CONSTRAINT "school_features_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;