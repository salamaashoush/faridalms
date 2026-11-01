CREATE TABLE "login_index" (
	"key" bytea,
	"tenant_id" uuid,
	CONSTRAINT "login_index_pkey" PRIMARY KEY("key","tenant_id"),
	CONSTRAINT "login_index_key_check" CHECK (octet_length(key) = 32)
);
--> statement-breakpoint
CREATE INDEX "login_index_tenant_idx" ON "login_index" ("tenant_id");--> statement-breakpoint
ALTER TABLE "login_index" ADD CONSTRAINT "login_index_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;