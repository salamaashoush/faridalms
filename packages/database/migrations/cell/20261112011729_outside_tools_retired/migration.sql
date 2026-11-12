-- Outside tools (LTI), course packages (cmi5) and record stores (xAPI) are
-- gone. A tool or package placed in a document leaves every copy of it: the
-- document, its versions and translations, discussion posts, published
-- website pages and admission forms. A collaborative document so changed
-- drops its shared state, which the editing server rebuilds from the content
-- on the next open. A lesson finished by its course packages is finished by
-- being viewed, and each package's zip goes to the trash, from which the
-- files sweep removes it and its bytes.
CREATE FUNCTION pg_temp.without_tools(value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result jsonb;
  item jsonb;
  key text;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'array' THEN
      result := '[]';
      FOR item IN SELECT e FROM jsonb_array_elements(value) AS e LOOP
        CONTINUE WHEN jsonb_typeof(item) = 'object' AND item ->> 'type' IN ('lti', 'cmi5');
        result := result || jsonb_build_array(pg_temp.without_tools(item));
      END LOOP;
      RETURN result;
    WHEN 'object' THEN
      result := '{}';
      FOR key, item IN SELECT * FROM jsonb_each(value) LOOP
        result := result || jsonb_build_object(key, pg_temp.without_tools(item));
      END LOOP;
      RETURN result;
    ELSE
      RETURN value;
  END CASE;
END
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.has_tools(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL
    AND jsonb_path_exists(value, 'lax $.** ? (@.type == "lti" || @.type == "cmi5")')
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.package_files(value jsonb) RETURNS SETOF uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT DISTINCT (id #>> '{}')::uuid
  FROM jsonb_path_query(value, 'lax $.** ? (@.type == "cmi5").fileId') AS id
  WHERE jsonb_typeof(id) = 'string'
$$;
--> statement-breakpoint
ALTER TABLE core.documents DISABLE TRIGGER documents_frozen_guard;
--> statement-breakpoint
DO $$
DECLARE
  t uuid;
  packages uuid[];
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    SELECT coalesce(array_agg(DISTINCT f), '{}') INTO packages FROM (
      SELECT pg_temp.package_files(content) FROM core.documents WHERE tenant_id = t
      UNION SELECT pg_temp.package_files(content) FROM core.document_versions WHERE tenant_id = t
      UNION SELECT pg_temp.package_files(content) FROM core.document_translations WHERE tenant_id = t
    ) AS found(f);

    UPDATE core.lessons SET completion = 'view'
    WHERE tenant_id = t AND completion = 'package';

    UPDATE core.documents
    SET content = pg_temp.without_tools(content),
      ydoc = null
    WHERE tenant_id = t AND pg_temp.has_tools(content);

    UPDATE core.document_versions
    SET content = pg_temp.without_tools(content),
      ydoc_snapshot = null
    WHERE tenant_id = t AND pg_temp.has_tools(content);

    UPDATE core.document_translations
    SET content = pg_temp.without_tools(content)
    WHERE tenant_id = t AND pg_temp.has_tools(content);

    UPDATE core.discussion_posts
    SET content = pg_temp.without_tools(content)
    WHERE tenant_id = t AND pg_temp.has_tools(content);

    UPDATE core.site_published_pages
    SET content = pg_temp.without_tools(content)
    WHERE tenant_id = t AND pg_temp.has_tools(content);

    UPDATE core.site_published_posts
    SET content = pg_temp.without_tools(content)
    WHERE tenant_id = t AND pg_temp.has_tools(content);

    UPDATE core.admission_forms
    SET body = pg_temp.without_tools(body),
      translation = pg_temp.without_tools(translation)
    WHERE tenant_id = t AND (pg_temp.has_tools(body) OR pg_temp.has_tools(translation));

    UPDATE core.admission_form_versions
    SET body = pg_temp.without_tools(body),
      translation = pg_temp.without_tools(translation)
    WHERE tenant_id = t AND (pg_temp.has_tools(body) OR pg_temp.has_tools(translation));

    UPDATE core.files SET trashed_at = statement_timestamp()
    WHERE tenant_id = t AND id = any (packages) AND status = 'active'
      AND trashed_at IS NULL;
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE core.documents ENABLE TRIGGER documents_frozen_guard;
