CREATE TABLE "login_attempts" (
	"key" varchar(64) PRIMARY KEY,
	"count" integer DEFAULT 1 NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(64) NOT NULL UNIQUE,
	"name" varchar(160) NOT NULL,
	"database_url" text NOT NULL,
	"time_zone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" varchar(64) PRIMARY KEY,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_reset_idx" ON "login_attempts" ("resets_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("school_id","user_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;