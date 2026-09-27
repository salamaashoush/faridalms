ALTER TABLE "core"."calendar_events" ADD COLUMN "title_en" text;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD COLUMN "title_ar" text;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The search trigger names the old column, so it goes while the title moves
-- and comes back on the two titles. A title written in Arabic script becomes
-- the Arabic title; any other the English one.
DROP TRIGGER index_host ON core.calendar_events;--> statement-breakpoint
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');
    UPDATE core.calendar_events
    SET title_en = CASE WHEN title ~ '[؀-ۿ]' THEN NULL ELSE title END,
        title_ar = CASE WHEN title ~ '[؀-ۿ]' THEN title ELSE NULL END
    WHERE tenant_id = t;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_title_en_check" CHECK (char_length(title_en) between 1 and 200);--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_title_ar_check" CHECK (char_length(title_ar) between 1 and 200);--> statement-breakpoint
ALTER TABLE "core"."calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_title_check", ADD CONSTRAINT "calendar_events_title_check" CHECK (num_nonnulls(title_en, title_ar) >= 1);--> statement-breakpoint
CREATE TRIGGER index_host AFTER INSERT OR UPDATE OF title_en, title_ar, location, status, org_id ON core.calendar_events
  FOR EACH ROW EXECUTE FUNCTION app.index_host('calendar_event', 'title_en', 'title_ar', 'location');--> statement-breakpoint
CREATE POLICY "p_site_select" ON "core"."calendar_events" AS PERMISSIVE FOR SELECT TO "site" USING (status = 'active' and public and state = 'published');--> statement-breakpoint
-- The public website reads what a visitor may see of a public event, nothing
-- about who wrote it or who it was for.
GRANT SELECT (tenant_id, id, org_id, title_en, title_ar, category, starts_on, ends_on, start_time, end_time,
  location, provisional, cancelled, state, public, status) ON core.calendar_events TO site;
