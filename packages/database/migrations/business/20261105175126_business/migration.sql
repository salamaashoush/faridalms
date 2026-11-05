CREATE TABLE "business_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"operator_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	CONSTRAINT "business_events_action_check" CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
	CONSTRAINT "business_events_reason_check" CHECK (reason is null or char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text,
	"roles" text[] NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"last_signed_in_at" timestamp with time zone,
	CONSTRAINT "operators_roles_check" CHECK (cardinality(roles) <= 4 and roles <@ array['owner', 'sales', 'support', 'finance']::text[]),
	CONSTRAINT "operators_state_check" CHECK (state in ('active', 'disabled')),
	CONSTRAINT "operators_name_check" CHECK (char_length(name) between 1 and 200)
);
--> statement-breakpoint
CREATE INDEX "business_events_subject_idx" ON "business_events" ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "business_events_occurred_idx" ON "business_events" ("occurred_at");