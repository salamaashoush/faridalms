CREATE TABLE "provisioning_drafts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"step" text DEFAULT 'customer' NOT NULL,
	"spec" jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}' NOT NULL,
	"tenant_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "provisioning_drafts_state_check" CHECK (state in ('draft', 'created', 'abandoned')),
	CONSTRAINT "provisioning_drafts_step_check" CHECK (step in ('customer', 'schools', 'plan', 'addresses', 'people', 'review')),
	CONSTRAINT "provisioning_drafts_created_check" CHECK (state <> 'created' or tenant_id is not null)
);
--> statement-breakpoint
CREATE INDEX "provisioning_drafts_state_idx" ON "provisioning_drafts" ("state","updated_at");--> statement-breakpoint
ALTER TABLE "provisioning_drafts" ADD CONSTRAINT "provisioning_drafts_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");