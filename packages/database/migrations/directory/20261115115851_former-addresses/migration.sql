CREATE TABLE "former_slugs" (
	"slug" text PRIMARY KEY,
	"school_id" uuid NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "former_slugs_slug_check" CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$')
);
--> statement-breakpoint
CREATE INDEX "former_slugs_school_idx" ON "former_slugs" ("school_id");--> statement-breakpoint
ALTER TABLE "former_slugs" ADD CONSTRAINT "former_slugs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;