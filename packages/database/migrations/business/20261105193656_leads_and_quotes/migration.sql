CREATE TABLE "business_profile" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"legal_name_en" text NOT NULL,
	"legal_name_ar" text NOT NULL,
	"address_en" text NOT NULL,
	"address_ar" text NOT NULL,
	"tax_number" text NOT NULL,
	"commercial_registry" text,
	"email" text NOT NULL,
	"phone" text,
	"website" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "business_profile_single_check" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "lead_activities_kind_check" CHECK (kind in ('call', 'meeting', 'email', 'note')),
	CONSTRAINT "lead_activities_note_check" CHECK (char_length(note) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"intake_id" uuid,
	"source" text NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"organisation" text NOT NULL,
	"role" text,
	"size" text,
	"country" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"message" text,
	"school_id" uuid,
	"tenant_id" uuid,
	"module" text,
	"owner_id" text,
	"next_step" text,
	"next_step_on" date,
	"lost_reason" text,
	"customer_id" uuid,
	"last_contact_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "leads_state_check" CHECK (state in ('new', 'contacted', 'demo_booked', 'demo_done', 'proposal', 'won', 'lost')),
	CONSTRAINT "leads_source_check" CHECK (source in ('demo_form', 'module_interest', 'manual')),
	CONSTRAINT "leads_lost_check" CHECK ((state = 'lost') = (lost_reason is not null)),
	CONSTRAINT "leads_lost_reason_check" CHECK (lost_reason in ('price', 'timing', 'competitor', 'no_response', 'not_fit')),
	CONSTRAINT "leads_country_check" CHECK (country ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"currency" text NOT NULL,
	"country" text NOT NULL,
	"vat_percent" numeric(5,2) NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"valid_until" date NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment" bytea,
	"draft_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "quotes_state_check" CHECK (state in ('draft', 'sent', 'accepted', 'superseded')),
	CONSTRAINT "quotes_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "quotes_party_check" CHECK (lead_id is not null or customer_id is not null),
	CONSTRAINT "quotes_accepted_check" CHECK ((state = 'accepted') = (accepted_at is not null and attachment is not null)),
	CONSTRAINT "quotes_attachment_check" CHECK (attachment is null or octet_length(attachment) <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"country" text NOT NULL,
	"percent" numeric(5,2) NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"valid_from" date NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "tax_rates_country_check" CHECK (country ~ '^[A-Z]{2}$'),
	CONSTRAINT "tax_rates_percent_check" CHECK (percent between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" ("lead_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_intake_key" ON "leads" ("intake_id");--> statement-breakpoint
CREATE INDEX "leads_state_idx" ON "leads" ("state","next_step_on");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_version_key" ON "quotes" ("number","version");--> statement-breakpoint
CREATE INDEX "quotes_lead_idx" ON "quotes" ("lead_id");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_country_from_key" ON "tax_rates" ("country","valid_from");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_draft_id_provisioning_drafts_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "provisioning_drafts"("id");