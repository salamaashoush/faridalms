ALTER TABLE "core"."standard_frameworks" RENAME COLUMN "case_identifier" TO "source_identifier";--> statement-breakpoint
ALTER TABLE "core"."standards" RENAME COLUMN "case_identifier" TO "source_identifier";--> statement-breakpoint
ALTER INDEX "core"."standard_frameworks_case_key" RENAME TO "standard_frameworks_source_key";--> statement-breakpoint
ALTER INDEX "core"."standards_case_key" RENAME TO "standards_source_key";--> statement-breakpoint
DROP INDEX "core"."standard_frameworks_source_key";--> statement-breakpoint
CREATE UNIQUE INDEX "standard_frameworks_source_key" ON "core"."standard_frameworks" ("tenant_id","org_id","source_identifier") WHERE status = 'active' and source_identifier is not null;--> statement-breakpoint
DROP INDEX "core"."standards_source_key";--> statement-breakpoint
CREATE UNIQUE INDEX "standards_source_key" ON "core"."standards" ("tenant_id","framework_id","source_identifier") WHERE status = 'active' and source_identifier is not null;