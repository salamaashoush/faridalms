CREATE TABLE "agreement_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"customer_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"method" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_title" text,
	"signer_email" text,
	"ip" text,
	"user_agent" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment" bytea,
	"recorded_by" text,
	"accepted_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "agreement_acceptances_method_check" CHECK (method in ('link', 'paper')),
	CONSTRAINT "agreement_acceptances_paper_check" CHECK ((method = 'paper') = (recorded_by is not null and attachment is not null)),
	CONSTRAINT "agreement_acceptances_attachment_check" CHECK (attachment is null or octet_length(attachment) <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "agreement_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"effective_on" date NOT NULL,
	"body_en" text NOT NULL,
	"body_ar" text,
	"digest" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"published_by" text NOT NULL,
	CONSTRAINT "agreement_versions_kind_check" CHECK (kind in ('terms', 'dpa')),
	CONSTRAINT "agreement_versions_digest_check" CHECK (digest ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "agreement_versions_version_check" CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$')
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "offer" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signer_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signer_title" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signer_email" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signer_ip" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signer_agent" text;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "replaces_item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
CREATE INDEX "agreement_acceptances_customer_idx" ON "agreement_acceptances" ("customer_id","accepted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_versions_kind_version_key" ON "agreement_versions" ("kind","version");--> statement-breakpoint
CREATE INDEX "agreement_versions_kind_idx" ON "agreement_versions" ("kind","effective_on");--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_version_id_agreement_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "agreement_versions"("id");--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_replaces_check" CHECK (cardinality(replaces_item_ids) = 0 or plan_version_id is not null);--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_accepted_check", ADD CONSTRAINT "quotes_accepted_check" CHECK ((state = 'accepted') = (accepted_at is not null and (attachment is not null or signer_name is not null)));--> statement-breakpoint
ALTER TABLE "subscription_overrides" DROP CONSTRAINT "subscription_overrides_span_check", ADD CONSTRAINT "subscription_overrides_span_check" CHECK (ends_on is null or ends_on >= starts_on);