CREATE TABLE "dunning_pauses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "dunning_pauses_days_check" CHECK (ends_on >= starts_on),
	CONSTRAINT "dunning_pauses_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "dunning_standings" (
	"tenant_id" uuid PRIMARY KEY,
	"customer_id" uuid NOT NULL,
	"standing" text NOT NULL,
	"since" date NOT NULL,
	CONSTRAINT "dunning_standings_standing_check" CHECK (standing in ('restricted', 'read_only', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "dunning_steps" (
	"invoice_id" uuid,
	"step" text,
	"taken_on" date NOT NULL,
	"emailed_to" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "dunning_steps_pkey" PRIMARY KEY("invoice_id","step"),
	CONSTRAINT "dunning_steps_step_check" CHECK (step in ('upcoming', 'due', 'overdue_7', 'overdue_14', 'restrict_notice', 'restricted', 'read_only_notice', 'read_only', 'suspend_notice', 'suspended', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"invoice_id" uuid,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"assignee_id" text,
	"done_at" timestamp with time zone,
	"done_by" text,
	"outcome" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "tasks_kind_check" CHECK (kind in ('call', 'contract_end')),
	CONSTRAINT "tasks_title_check" CHECK (char_length(title) between 1 and 300),
	CONSTRAINT "tasks_done_check" CHECK ((done_at is null) = (done_by is null) and (done_at is null) = (outcome is null)),
	CONSTRAINT "tasks_outcome_check" CHECK (outcome is null or char_length(outcome) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "account_owner_id" text;--> statement-breakpoint
CREATE INDEX "dunning_pauses_customer_idx" ON "dunning_pauses" ("customer_id","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_key" ON "tasks" ("key");--> statement-breakpoint
CREATE INDEX "tasks_open_idx" ON "tasks" ("due_on") WHERE done_at is null;--> statement-breakpoint
CREATE INDEX "tasks_customer_idx" ON "tasks" ("customer_id");--> statement-breakpoint
ALTER TABLE "dunning_pauses" ADD CONSTRAINT "dunning_pauses_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "dunning_standings" ADD CONSTRAINT "dunning_standings_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "dunning_steps" ADD CONSTRAINT "dunning_steps_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");