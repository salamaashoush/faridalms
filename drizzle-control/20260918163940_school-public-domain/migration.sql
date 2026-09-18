ALTER TABLE "schools" ADD COLUMN "public_domain" varchar(253);--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_public_domain_key" UNIQUE("public_domain");