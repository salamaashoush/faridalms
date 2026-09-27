ALTER TABLE "core"."newsletters" ADD COLUMN "translation_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."newsletters" ADD COLUMN "translation_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."newsletters" ADD COLUMN "translation_source_digest" text;--> statement-breakpoint
-- The column is new and empty on every row, and checking existing rows would
-- read them under forced row security with no tenant bound; new and changed
-- rows are checked all the same.
ALTER TABLE "core"."newsletters" ADD CONSTRAINT "newsletters_tenant_id_translation_reviewed_by_user_id_fkey" FOREIGN KEY ("tenant_id","translation_reviewed_by_user_id") REFERENCES "core"."users"("tenant_id","id") NOT VALID;--> statement-breakpoint
ALTER TABLE "core"."newsletters" ADD CONSTRAINT "newsletters_translation_review_check" CHECK ((translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null));--> statement-breakpoint
-- Newsletters were lists of headed sections; each language becomes one
-- document, a section's heading becoming a level-two heading before its text.
-- A translation checked section by section counts as checked as a whole when
-- every written section of the original was checked, and it is recorded
-- against the original's words as they read now. Snapshots readers have are
-- converted too, and one that matched its document still matches after the
-- conversion bumps the document's version.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.newsletters n
    SET translation_reviewed_at = tr.date_last_modified,
        translation_reviewed_by_user_id = n.author_user_id,
        translation_source_digest = md5(btrim(regexp_replace(o.plain_text, '\s+', ' ', 'g')))
    FROM core.documents o
    JOIN core.documents tr ON tr.tenant_id = o.tenant_id AND tr.translation_of_id = o.id
      AND tr.status = 'active'
    WHERE n.tenant_id = t AND n.bilingual
      AND o.tenant_id = n.tenant_id AND o.host_type = 'newsletter' AND o.host_id = n.id
      AND o.translation_of_id IS NULL AND o.status = 'active'
      AND o.content ? 'sections'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(o.content->'sections') s
        WHERE btrim(coalesce(s->>'heading', '')) <> ''
           OR jsonb_path_exists(s->'body', 'lax $.**.text ? (@ like_regex "\\S")'))
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(o.content->'sections') s
        WHERE (btrim(coalesce(s->>'heading', '')) <> ''
           OR jsonb_path_exists(s->'body', 'lax $.**.text ? (@ like_regex "\\S")'))
          AND NOT (coalesce(tr.content->'reviewed', '[]'::jsonb) ? (s->>'id')));

    UPDATE core.document_versions v
    SET content = jsonb_build_object('root', jsonb_build_object(
      'type', 'root', 'version', 1, 'direction', null, 'format', '', 'indent', 0,
      'children', coalesce((
        SELECT jsonb_agg(node ORDER BY s_ord, n_ord)
        FROM jsonb_array_elements(v.content->'sections') WITH ORDINALITY AS s(section, s_ord),
        LATERAL (
          SELECT jsonb_build_object('type', 'heading', 'version', 1, 'tag', 'h2',
            'direction', null, 'format', '', 'indent', 0,
            'children', jsonb_build_array(jsonb_build_object('type', 'text', 'version', 1,
              'format', 0, 'detail', 0, 'mode', 'normal', 'style', '',
              'text', btrim(section->>'heading')))) AS node, 0::bigint AS n_ord
          WHERE btrim(coalesce(section->>'heading', '')) <> ''
          UNION ALL
          SELECT child, n FROM jsonb_array_elements(
            coalesce(section->'body'->'root'->'children', '[]'::jsonb)) WITH ORDINALITY AS b(child, n)
        ) nodes), jsonb_build_array(jsonb_build_object('type', 'paragraph', 'version', 1,
          'children', '[]'::jsonb, 'direction', null, 'format', '', 'indent', 0,
          'textFormat', 0, 'textStyle', '')))))
    FROM core.documents d
    WHERE v.tenant_id = t AND d.tenant_id = v.tenant_id AND d.id = v.document_id
      AND d.host_type = 'newsletter' AND v.content ? 'sections';

    UPDATE core.documents d
    SET content = jsonb_build_object('root', jsonb_build_object(
      'type', 'root', 'version', 1, 'direction', null, 'format', '', 'indent', 0,
      'children', coalesce((
        SELECT jsonb_agg(node ORDER BY s_ord, n_ord)
        FROM jsonb_array_elements(d.content->'sections') WITH ORDINALITY AS s(section, s_ord),
        LATERAL (
          SELECT jsonb_build_object('type', 'heading', 'version', 1, 'tag', 'h2',
            'direction', null, 'format', '', 'indent', 0,
            'children', jsonb_build_array(jsonb_build_object('type', 'text', 'version', 1,
              'format', 0, 'detail', 0, 'mode', 'normal', 'style', '',
              'text', btrim(section->>'heading')))) AS node, 0::bigint AS n_ord
          WHERE btrim(coalesce(section->>'heading', '')) <> ''
          UNION ALL
          SELECT child, n FROM jsonb_array_elements(
            coalesce(section->'body'->'root'->'children', '[]'::jsonb)) WITH ORDINALITY AS b(child, n)
        ) nodes), jsonb_build_array(jsonb_build_object('type', 'paragraph', 'version', 1,
          'children', '[]'::jsonb, 'direction', null, 'format', '', 'indent', 0,
          'textFormat', 0, 'textStyle', '')))))
    WHERE d.tenant_id = t AND d.host_type = 'newsletter' AND d.content ? 'sections';

    UPDATE core.document_versions v
    SET document_version = d.version
    FROM core.documents d
    WHERE v.tenant_id = t AND d.tenant_id = v.tenant_id AND d.id = v.document_id
      AND d.host_type = 'newsletter' AND v.reason = 'publish'
      AND v.document_version = d.version - 1
      AND d.date_last_modified = statement_timestamp();
  END LOOP;
END $$;
