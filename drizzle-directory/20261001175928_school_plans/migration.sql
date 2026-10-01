CREATE TABLE "school_plans" (
	"school_id" uuid PRIMARY KEY,
	"pool_bytes" bigint,
	"class_bytes" bigint,
	"module_bytes" bigint,
	"person_bytes" bigint,
	"modules" text[],
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "school_plans_pool_bytes_check" CHECK (pool_bytes > 0),
	CONSTRAINT "school_plans_class_bytes_check" CHECK (class_bytes > 0),
	CONSTRAINT "school_plans_module_bytes_check" CHECK (module_bytes > 0),
	CONSTRAINT "school_plans_person_bytes_check" CHECK (person_bytes > 0),
	CONSTRAINT "school_plans_modules_check" CHECK (modules <@ array['elearning', 'early_years', 'video', 'coding']::text[])
);
--> statement-breakpoint
CREATE TABLE "school_usage" (
	"school_id" uuid PRIMARY KEY,
	"used_bytes" bigint NOT NULL,
	"file_count" integer NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "school_usage_used_bytes_check" CHECK (used_bytes >= 0),
	CONSTRAINT "school_usage_file_count_check" CHECK (file_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "school_plans" ADD CONSTRAINT "school_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_usage" ADD CONSTRAINT "school_usage_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");