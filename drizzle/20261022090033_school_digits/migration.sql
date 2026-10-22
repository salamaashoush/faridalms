ALTER TABLE "core"."orgs" ADD COLUMN "digits" text DEFAULT 'latn' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."orgs" ADD CONSTRAINT "orgs_digits_check" CHECK (digits in ('latn', 'arab'));