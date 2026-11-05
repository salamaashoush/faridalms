CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"invoice_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"tax_authority_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "credit_notes_reason_check" CHECK (char_length(reason) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "document_numbers" (
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "document_numbers_series_check" CHECK (series in ('INV', 'CN'))
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text NOT NULL,
	"item_code" text,
	"period_start" date,
	"period_end" date,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"discount_percent" numeric(5,2) DEFAULT '0' NOT NULL,
	CONSTRAINT "invoice_lines_quantity_check" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid,
	"kind" text NOT NULL,
	"schedule_key" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"number" text,
	"issued_on" date,
	"due_on" date,
	"for_day" date NOT NULL,
	"currency" text NOT NULL,
	"country" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"purchase_order" text,
	"vat_percent" numeric(5,2) NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"tax_authority_id" text,
	"payment_link_id" text,
	"payment_order_id" text,
	"payment_link_url" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "invoices_state_check" CHECK (state in ('draft', 'issued', 'partly_paid', 'paid', 'credited')),
	CONSTRAINT "invoices_kind_check" CHECK (kind in ('instalment', 'proration', 'true_up', 'manual')),
	CONSTRAINT "invoices_currency_check" CHECK (currency in ('EGP', 'USD')),
	CONSTRAINT "invoices_issued_check" CHECK ((state = 'draft') = (number is null) and (number is null) = (issued_on is null) and (issued_on is null) = (due_on is null))
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "payment_allocations_amount_check" CHECK (amount_minor > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"method" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"received_on" date NOT NULL,
	"reference" text NOT NULL,
	"provider_transaction_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "payments_method_check" CHECK (method in ('bank_transfer', 'card', 'instapay', 'cheque', 'withholding_certificate')),
	CONSTRAINT "payments_amount_check" CHECK (amount_minor > 0 and fee_minor >= 0),
	CONSTRAINT "payments_currency_check" CHECK (currency in ('EGP', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "business_profile" ADD COLUMN "bank_details_en" text;--> statement-breakpoint
ALTER TABLE "business_profile" ADD COLUMN "bank_details_ar" text;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes" ("number");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_numbers_key" ON "document_numbers" ("series","year");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_position_key" ON "invoice_lines" ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_schedule_key" ON "invoices" ("schedule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_payment_order_key" ON "invoices" ("payment_order_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" ("customer_id","for_day");--> statement-breakpoint
CREATE INDEX "invoices_state_idx" ON "invoices" ("state","due_on");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_key" ON "payments" ("provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" ("customer_id","received_on");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");