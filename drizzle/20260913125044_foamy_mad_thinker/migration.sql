CREATE TYPE "permission" AS ENUM('access:manage', 'school:manage', 'users:read', 'users:manage', 'classes:read', 'classes:manage', 'calendar:manage', 'announcements:manage', 'reports:read', 'roster:read', 'assignments:author', 'submissions:grade', 'attendance:record', 'children:read', 'own-work:read', 'own-work:submit', 'grades:read', 'attendance:read', 'timetable:read', 'messages:read', 'messages:send', 'newsletters:read', 'calendar:read');--> statement-breakpoint
CREATE TABLE "access_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(128) NOT NULL,
	"base_role" "role" NOT NULL,
	"builtin_role" "role" UNIQUE,
	"permissions" "permission"[] NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_access_roles" (
	"user_id" uuid PRIMARY KEY,
	"access_role_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_changes_created_idx" ON "access_changes" ("created_at");--> statement-breakpoint
CREATE INDEX "user_access_roles_role_idx" ON "user_access_roles" ("access_role_id");--> statement-breakpoint
ALTER TABLE "access_changes" ADD CONSTRAINT "access_changes_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_access_role_id_access_roles_id_fkey" FOREIGN KEY ("access_role_id") REFERENCES "access_roles"("id");