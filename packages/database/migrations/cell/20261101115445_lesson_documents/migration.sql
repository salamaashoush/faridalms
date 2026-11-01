-- Lessons stored as a list of blocks become the one document their teacher
-- writes, in the shape the editor saves: a run of text keeps its nodes, a
-- question becomes a question node with the id it had, so answers already
-- given still match. The working copy, its published versions and its
-- translations move alike. Only the block kinds such lessons were written
-- with are converted; anything else stops the migration, which then changes
-- nothing, so no lesson is ever read with part of it missing.
CREATE FUNCTION pg_temp.lesson_text(value text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'text', 'version', 1, 'format', 0,
    'detail', 0, 'mode', 'normal', 'style', '', 'text', value)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.lesson_inline(kind text, value text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', kind, 'version', 1, 'direction', null,
    'format', '', 'indent', 0, 'textFormat', 0, 'textStyle', '',
    'children', CASE WHEN coalesce(value, '') = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(pg_temp.lesson_text(value)) END)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.lesson_pick(item jsonb, keys text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_object_agg(k, item -> k), '{}'::jsonb)
  FROM unnest(keys) AS k WHERE item ? k
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.lesson_truthy(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL
    AND value NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.lesson_nodes(block jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  kind text := block ->> 'type';
  common text[] := ARRAY['id', 'type', 'prompt', 'points', 'hints',
    'explanation', 'tries', 'feedbackAt', 'videoAt', 'standards',
    'narration', 'narrationWords'];
  allowed text[];
  extra text;
  node jsonb;
  children jsonb;
  passages jsonb;
  item jsonb;
  segment jsonb;
  line text;
  first boolean;
  gap text;
  right_answer text;
BEGIN
  IF kind = 'content' THEN
    allowed := ARRAY['id', 'type', 'content'];
  ELSIF kind = 'choice' THEN
    allowed := common || ARRAY['options', 'correctOptionIds', 'multiple', 'shuffle'];
  ELSIF kind = 'text' THEN
    allowed := common || ARRAY['answers', 'caseSensitive', 'closeEnough', 'tehMarbuta'];
  ELSIF kind = 'written' THEN
    allowed := common || ARRAY['wordLimit', 'recordSeconds', 'recordVideo',
      'answerWith', 'picture', 'passage'];
  ELSIF kind = 'gaps' THEN
    allowed := common || ARRAY['segments', 'caseSensitive', 'closeEnough',
      'tehMarbuta', 'bank'];
  ELSE
    RAISE EXCEPTION 'lesson block % is a %, which this migration does not convert',
      block ->> 'id', coalesce(kind, 'block without a type');
  END IF;
  SELECT k INTO extra FROM jsonb_object_keys(block) AS k
  WHERE NOT k = ANY (allowed) LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'lesson block % holds %, which this migration does not convert',
      block ->> 'id', extra;
  END IF;

  IF kind = 'content' THEN
    IF jsonb_typeof(block -> 'content' -> 'root' -> 'children') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'lesson block % holds no document', block ->> 'id';
    END IF;
    RETURN block -> 'content' -> 'root' -> 'children';
  END IF;

  IF position('\(' IN block::text) > 0 OR position('\[' IN block::text) > 0 THEN
    RAISE EXCEPTION 'lesson block % writes mathematics, which this migration does not convert',
      block ->> 'id';
  END IF;
  IF pg_temp.lesson_truthy(block -> 'narration') THEN
    RAISE EXCEPTION 'lesson block % has a recording, which this migration does not convert',
      block ->> 'id';
  END IF;
  IF jsonb_typeof(block -> 'hints') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'lesson block % has no hints list', block ->> 'id';
  END IF;

  node := jsonb_build_object('type', 'question', 'version', 1, 'format', '',
      'indent', 0, 'direction', null, 'kind', kind, 'questionId', block -> 'id')
    || pg_temp.lesson_pick(block, ARRAY['points', 'tries', 'explanation'])
    || CASE WHEN coalesce(block ->> 'feedbackAt', '') NOT IN ('', 'now')
        THEN jsonb_build_object('feedbackAt', block -> 'feedbackAt') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_array_length(block -> 'hints') > 0
        THEN jsonb_build_object('hints', block -> 'hints') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(block -> 'videoAt') = 'number'
        THEN jsonb_build_object('videoAt', block -> 'videoAt') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(block -> 'standards') = 'array'
          AND jsonb_array_length(block -> 'standards') > 0
        THEN jsonb_build_object('standards', block -> 'standards') ELSE '{}'::jsonb END;
  children := jsonb_build_array(pg_temp.lesson_inline('question-prompt', block ->> 'prompt'));

  IF kind = 'choice' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(block -> 'options', '[]'::jsonb)) LOOP
      SELECT k INTO extra FROM jsonb_object_keys(item) AS k
      WHERE NOT k = ANY (ARRAY['id', 'text', 'feedback', 'picture', 'narration']) LIMIT 1;
      IF extra IS NOT NULL OR pg_temp.lesson_truthy(item -> 'picture')
        OR pg_temp.lesson_truthy(item -> 'narration') THEN
        RAISE EXCEPTION 'an option of lesson block % holds %, which this migration does not convert',
          block ->> 'id', coalesce(extra, 'a picture or a recording');
      END IF;
      children := children || jsonb_build_array(
        pg_temp.lesson_inline('question-option', item ->> 'text')
        || jsonb_build_object('optionId', item -> 'id',
          'correct', coalesce(block -> 'correctOptionIds', '[]'::jsonb)
            @> jsonb_build_array(item -> 'id'))
        || pg_temp.lesson_pick(item, ARRAY['feedback']));
    END LOOP;
    RETURN jsonb_build_array(node
      || pg_temp.lesson_pick(block, ARRAY['multiple', 'shuffle'])
      || jsonb_build_object('children', children));
  END IF;

  IF kind = 'text' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(block -> 'answers', '[]'::jsonb)) LOOP
      children := children || jsonb_build_array(
        pg_temp.lesson_inline('question-answer', item #>> '{}'));
    END LOOP;
    RETURN jsonb_build_array(node
      || pg_temp.lesson_pick(block, ARRAY['caseSensitive', 'closeEnough', 'tehMarbuta'])
      || jsonb_build_object('children', children));
  END IF;

  IF kind = 'written' THEN
    IF pg_temp.lesson_truthy(block -> 'recordSeconds')
      OR pg_temp.lesson_truthy(block -> 'answerWith') THEN
      RAISE EXCEPTION 'lesson block % is answered by recording or drawing, which this migration does not convert',
        block ->> 'id';
    END IF;
    RETURN jsonb_build_array(node
      || pg_temp.lesson_pick(block, ARRAY['wordLimit'])
      || jsonb_build_object('children', children));
  END IF;

  passages := jsonb_build_array(pg_temp.lesson_inline('question-passage', ''));
  FOR segment IN SELECT value FROM jsonb_array_elements(coalesce(block -> 'segments', '[]'::jsonb)) LOOP
    IF segment ->> 'type' = 'gap' THEN
      IF jsonb_array_length(coalesce(segment -> 'options', '[]'::jsonb)) = 0 THEN
        SELECT coalesce(string_agg(a, '/' ORDER BY n), '') INTO gap
        FROM jsonb_array_elements_text(coalesce(segment -> 'answers', '[]'::jsonb))
          WITH ORDINALITY AS answers(a, n);
      ELSE
        right_answer := coalesce(segment -> 'answers' ->> 0, '');
        SELECT right_answer || coalesce(string_agg('|' || o, '' ORDER BY n), '') INTO gap
        FROM jsonb_array_elements_text(segment -> 'options') WITH ORDINALITY AS options(o, n)
        WHERE o IS DISTINCT FROM right_answer;
      END IF;
      passages := jsonb_set(passages,
        ARRAY[(jsonb_array_length(passages) - 1)::text, 'children'],
        (passages -> -1 -> 'children') || jsonb_build_array(
          pg_temp.lesson_inline('question-gap', gap)
          || jsonb_build_object('optionId', segment -> 'id')));
    ELSIF segment ->> 'type' = 'text' THEN
      first := true;
      FOREACH line IN ARRAY string_to_array(coalesce(segment ->> 'text', ''), E'\n') LOOP
        IF NOT first THEN
          passages := passages || jsonb_build_array(pg_temp.lesson_inline('question-passage', ''));
        END IF;
        first := false;
        IF line <> '' THEN
          passages := jsonb_set(passages,
            ARRAY[(jsonb_array_length(passages) - 1)::text, 'children'],
            (passages -> -1 -> 'children') || jsonb_build_array(pg_temp.lesson_text(line)));
        END IF;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'lesson block % has a passage part this migration does not convert',
        block ->> 'id';
    END IF;
  END LOOP;
  RETURN jsonb_build_array(node
    || pg_temp.lesson_pick(block, ARRAY['caseSensitive', 'closeEnough', 'tehMarbuta'])
    || CASE WHEN pg_temp.lesson_truthy(block -> 'bank')
        THEN jsonb_build_object('bank', block -> 'bank') ELSE '{}'::jsonb END
    || jsonb_build_object('children', children || passages));
END
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.lesson_document(content jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  children jsonb := '[]'::jsonb;
  block jsonb;
BEGIN
  IF content -> 'version' IS DISTINCT FROM '2'::jsonb
    OR jsonb_typeof(content -> 'blocks') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'a lesson is stored in a shape this migration does not convert: %',
      left(content::text, 200);
  END IF;
  FOR block IN SELECT value FROM jsonb_array_elements(content -> 'blocks') LOOP
    children := children || pg_temp.lesson_nodes(block);
  END LOOP;
  IF jsonb_array_length(children) = 0 THEN
    children := jsonb_build_array(pg_temp.lesson_inline('paragraph', ''));
  END IF;
  RETURN jsonb_build_object('root', jsonb_build_object('type', 'root',
    'version', 1, 'direction', null, 'format', '', 'indent', 0,
    'children', children));
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    IF EXISTS (SELECT 1 FROM core.documents
        WHERE tenant_id = t AND host_type = 'assignment_quiz') THEN
      RAISE EXCEPTION 'tenant % has a quiz whose questions are kept apart from its brief', t;
    END IF;
    IF EXISTS (SELECT 1 FROM core.documents d
        WHERE d.tenant_id = t AND d.kind <> 'lesson'
          AND (d.content ? 'blocks' AND NOT d.content ? 'root'
            OR EXISTS (SELECT 1 FROM core.document_versions v
              WHERE v.tenant_id = t AND v.document_id = d.id
                AND v.content ? 'blocks' AND NOT v.content ? 'root')
            OR EXISTS (SELECT 1 FROM core.document_translations r
              WHERE r.tenant_id = t AND r.document_id = d.id
                AND r.content ? 'blocks' AND NOT r.content ? 'root'))) THEN
      RAISE EXCEPTION 'tenant % keeps a list of blocks in a document that is not a lesson', t;
    END IF;
    IF EXISTS (SELECT 1 FROM core.documents
        WHERE tenant_id = t AND jsonb_path_exists(content,
          'lax $.** ? (@.type == "question" && exists(@.hint))'))
      OR EXISTS (SELECT 1 FROM core.document_versions
        WHERE tenant_id = t AND jsonb_path_exists(content,
          'lax $.** ? (@.type == "question" && exists(@.hint))'))
      OR EXISTS (SELECT 1 FROM core.document_translations
        WHERE tenant_id = t AND jsonb_path_exists(content,
          'lax $.** ? (@.type == "question" && exists(@.hint))')) THEN
      RAISE EXCEPTION 'tenant % has a question saved with one hint', t;
    END IF;

    UPDATE core.documents
    SET content = pg_temp.lesson_document(content), schema_version = 1, ydoc = null
    WHERE tenant_id = t AND kind = 'lesson'
      AND content ? 'blocks' AND NOT content ? 'root';

    UPDATE core.document_versions v
    SET content = pg_temp.lesson_document(v.content)
    FROM core.documents d
    WHERE v.tenant_id = t AND d.tenant_id = t AND v.document_id = d.id
      AND d.kind = 'lesson' AND v.content ? 'blocks' AND NOT v.content ? 'root';

    UPDATE core.document_translations r
    SET content = pg_temp.lesson_document(r.content)
    FROM core.documents d
    WHERE r.tenant_id = t AND d.tenant_id = t AND r.document_id = d.id
      AND d.kind = 'lesson' AND r.content ? 'blocks' AND NOT r.content ? 'root';
  END LOOP;
END $$;
--> statement-breakpoint
DROP FUNCTION pg_temp.lesson_document(jsonb);
--> statement-breakpoint
DROP FUNCTION pg_temp.lesson_nodes(jsonb);
--> statement-breakpoint
DROP FUNCTION pg_temp.lesson_truthy(jsonb);
--> statement-breakpoint
DROP FUNCTION pg_temp.lesson_pick(jsonb, text[]);
--> statement-breakpoint
DROP FUNCTION pg_temp.lesson_inline(text, text);
--> statement-breakpoint
DROP FUNCTION pg_temp.lesson_text(text);
