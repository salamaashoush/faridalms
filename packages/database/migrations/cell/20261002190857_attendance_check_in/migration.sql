ALTER TABLE "core"."attendance_settings" ADD COLUMN "check_in_touch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD COLUMN "check_in_qr" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."attendance_settings" ADD COLUMN "check_in_nfc" boolean DEFAULT false NOT NULL;