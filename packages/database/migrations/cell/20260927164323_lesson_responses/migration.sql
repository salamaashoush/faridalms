CREATE TABLE "core"."lesson_responses" (
	"tenant_id" uuid,
	"id" uuid DEFAULT uuidv7(),
	"lesson_id" uuid NOT NULL,
	"document_version_id" uuid,
	"student_user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"try" smallint NOT NULL,
	"kind" text NOT NULL,
	"response" jsonb NOT NULL,
	"fraction" numeric(5,4),
	"state" text NOT NULL,
	"feedback" text,
	"marked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "lesson_responses_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "lesson_responses_attempt_check" CHECK (attempt between 1 and 1000),
	CONSTRAINT "lesson_responses_try_check" CHECK (try between 1 and 1000),
	CONSTRAINT "lesson_responses_kind_check" CHECK (kind in ('choice', 'text', 'gaps', 'number', 'written')),
	CONSTRAINT "lesson_responses_response_check" CHECK (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
	CONSTRAINT "lesson_responses_fraction_check" CHECK (fraction is null or fraction between 0 and 1),
	CONSTRAINT "lesson_responses_state_check" CHECK (state in ('answered', 'revealed', 'needs_marking', 'marked')),
	CONSTRAINT "lesson_responses_marked_check" CHECK ((state = 'marked') = (marked_by_user_id is not null) and (state <> 'needs_marking' or fraction is null)),
	CONSTRAINT "lesson_responses_feedback_check" CHECK (feedback is null or char_length(feedback) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" DROP CONSTRAINT "lesson_progress_answers_check";--> statement-breakpoint
CREATE INDEX "lesson_responses_student_idx" ON "core"."lesson_responses" ("tenant_id","lesson_id","student_user_id","attempt");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("tenant_id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_lesson_id_fkey" FOREIGN KEY ("tenant_id","lesson_id") REFERENCES "core"."lessons"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_document_version_id_fkey" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "core"."document_versions"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_student_user_id_fkey" FOREIGN KEY ("tenant_id","student_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
ALTER TABLE "core"."lesson_responses" ADD CONSTRAINT "lesson_responses_tenant_id_marked_by_user_id_fkey" FOREIGN KEY ("tenant_id","marked_by_user_id") REFERENCES "core"."users"("tenant_id","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."lesson_responses" AS RESTRICTIVE FOR ALL TO public USING (tenant_id = (select app.tenant_id())) WITH CHECK (tenant_id = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "owner_all" ON "core"."lesson_responses" AS PERMISSIVE FOR ALL TO "cell_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "p_select" ON "core"."lesson_responses" AS PERMISSIVE FOR SELECT TO "app", "cell_io", "retention", "worker" USING (true);--> statement-breakpoint
CREATE POLICY "p_insert" ON "core"."lesson_responses" AS PERMISSIVE FOR INSERT TO "app", "cell_io", "worker" WITH CHECK (true);--> statement-breakpoint
-- Lessons saved before questions had points, hints and feedback move to the
-- shape of today, lessons already open to students are published as they
-- stand, and each student's saved answers become response rows before the
-- column that held them goes.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');
    UPDATE core.documents d
    SET content = jsonb_build_object('version', 2, 'blocks', coalesce((
      SELECT jsonb_agg(CASE b->>'type'
        WHEN 'quiz' THEN jsonb_build_object(
          'id', b->'id', 'type', 'choice', 'prompt', b->'question', 'points', 1, 'hint', '',
          'explanation', coalesce(b->'explanation', to_jsonb(''::text)), 'tries', null,
          'options', (SELECT jsonb_agg(o || jsonb_build_object('feedback', '')) FROM jsonb_array_elements(b->'options') o),
          'correctOptionIds', b->'correctOptionIds',
          'multiple', jsonb_array_length(b->'correctOptionIds') > 1, 'shuffle', false)
        WHEN 'reflection' THEN jsonb_build_object(
          'id', b->'id', 'type', 'written', 'prompt', b->'prompt', 'points', 0, 'hint', '',
          'explanation', '', 'tries', null, 'wordLimit', null)
        WHEN 'media' THEN jsonb_build_object('transcript', '') || b
        ELSE b END ORDER BY ord)
      FROM jsonb_array_elements(d.content->'blocks') WITH ORDINALITY AS x(b, ord)), '[]'::jsonb))
    WHERE d.tenant_id = t AND d.host_type = 'lesson' AND coalesce((d.content->>'version')::int, 1) = 1;

    -- Students now play a lesson's last published snapshot, so lessons of
    -- modules already open take their current content as that snapshot.
    INSERT INTO core.document_versions
      (tenant_id, document_id, document_version, reason, content, plain_text)
    SELECT d.tenant_id, d.id, d.version, 'publish', d.content, d.plain_text
    FROM core.documents d
    JOIN core.lessons l ON l.tenant_id = d.tenant_id AND l.id = d.host_id AND l.status = 'active'
    JOIN core.learning_modules m ON m.tenant_id = l.tenant_id AND m.id = l.module_id
      AND m.state <> 'draft'
    WHERE d.tenant_id = t AND d.host_type = 'lesson' AND d.status = 'active'
      AND d.translation_of_id IS NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO core.lesson_responses
      (tenant_id, lesson_id, student_user_id, block_id, attempt, try, kind, response, fraction, state, created_at)
    SELECT p.tenant_id, p.lesson_id, p.student_user_id, q.key::uuid, 1,
      greatest(1, coalesce((q.value->>'tries')::int, 1)), 'choice',
      jsonb_build_object('type', 'choice', 'optionIds', q.value->'optionIds'),
      CASE WHEN (q.value->>'correct')::boolean THEN 1 ELSE 0 END, 'answered', p.date_last_modified
    FROM core.lesson_progress p, jsonb_each(coalesce(p.answers->'quiz', '{}'::jsonb)) q
    WHERE p.tenant_id = t AND p.status = 'active';

    INSERT INTO core.lesson_responses
      (tenant_id, lesson_id, student_user_id, block_id, attempt, try, kind, response, fraction, state, created_at)
    SELECT p.tenant_id, p.lesson_id, p.student_user_id, r.key::uuid, 1, 1, 'written',
      jsonb_build_object('type', 'written', 'text', r.value->'text'), null, 'answered', p.date_last_modified
    FROM core.lesson_progress p, jsonb_each(coalesce(p.answers->'reflections', '{}'::jsonb)) r
    WHERE p.tenant_id = t AND p.status = 'active' AND coalesce(r.value->>'text', '') <> '';

    UPDATE core.lesson_progress SET attempts = 1 WHERE tenant_id = t AND attempts <> 1;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "core"."lesson_progress" DROP COLUMN "answers";
