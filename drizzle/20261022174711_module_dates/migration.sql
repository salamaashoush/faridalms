ALTER TABLE "core"."module_classes" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "core"."module_classes" ADD CONSTRAINT "module_classes_dates_check" CHECK ((starts_on is null) = (ends_on is null) and (ends_on is null or ends_on >= starts_on));