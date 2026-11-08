-- A form's questions become question blocks, and a family's answers the
-- responses those blocks take, so forms ask with the model lessons and
-- quizzes mark with. The website's enquiry form keeps them in a document
-- of the section's (in the page's document, its translation, their
-- versions and the published copies); an application form keeps its
-- original and its translation on the form and on each published version;
-- an application's draft answers and every kept answer move with them.
--
-- An option's id is its question's id and its place, so the original and
-- its translation, moved separately, name each option alike, and a family's
-- choice is found by its words among the options of the form they read.
-- Every answer keeps its words. Any kind of question this migration does
-- not know stops it, which then changes nothing.
CREATE FUNCTION pg_temp.form_text(value text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'text', 'version', 1, 'format', 0,
    'detail', 0, 'mode', 'normal', 'style', '', 'text', value)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_inline(kind text, value text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', kind, 'version', 1, 'direction', null,
    'format', '', 'indent', 0, 'textFormat', 0, 'textStyle', '',
    'children', CASE WHEN coalesce(value, '') = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(pg_temp.form_text(value)) END)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(value, ''), '^\s+|\s+$', '', 'g')
$$;
--> statement-breakpoint
-- A choice's options as the form read them (enquiries.optionsOf): one a
-- line, trimmed, blank lines and repeats dropped, at most twenty.
CREATE FUNCTION pg_temp.form_options(value text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(line ORDER BY first), '{}')
  FROM (
    SELECT line, min(n) AS first
    FROM unnest(string_to_array(coalesce(value, ''), E'\n')) WITH ORDINALITY AS u(raw, n),
      LATERAL (SELECT pg_temp.form_trim(raw) AS line) l
    WHERE line <> ''
    GROUP BY line
    ORDER BY first
    LIMIT 20
  ) o
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_option_id(question text, place integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(question || ':' || place)::uuid::text
$$;
--> statement-breakpoint
-- Words a question has in one language, or the other's where it has none,
-- as admissions.questionIn read them.
CREATE FUNCTION pg_temp.form_pick(mine text, other text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN pg_temp.form_trim(mine) <> '' THEN pg_temp.form_trim(mine)
    ELSE pg_temp.form_trim(other) END
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_question(
  id text, kind text, required boolean, label text, hint text, options text[]
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  node jsonb;
  children jsonb := jsonb_build_array(
    pg_temp.form_inline('question-prompt', pg_temp.form_trim(label)));
BEGIN
  node := jsonb_build_object('type', 'question', 'version', 1, 'format', '',
    'indent', 0, 'direction', null,
    'kind', CASE kind WHEN 'short' THEN 'text' WHEN 'date' THEN 'text'
      WHEN 'long' THEN 'written' ELSE kind END,
    'questionId', id, 'points', 0, 'tries', null, 'explanation', '');
  IF pg_temp.form_trim(hint) <> '' THEN
    node := node || jsonb_build_object('hints', jsonb_build_array(pg_temp.form_trim(hint)));
  END IF;
  IF required THEN
    node := node || '{"required": true}';
  END IF;
  CASE kind
    WHEN 'short' THEN
      node := node || '{"caseSensitive": false, "closeEnough": false, "tehMarbuta": true}';
    WHEN 'date' THEN
      node := node || '{"caseSensitive": false, "closeEnough": false, "tehMarbuta": true, "date": true}';
    WHEN 'long' THEN
      node := node || '{"wordLimit": null}';
    WHEN 'number' THEN
      node := node || '{"numberMode": "exact", "answerValue": 0, "tolerance": 0, "percent": false, "rangeMin": 0, "rangeMax": 0}';
    WHEN 'choice' THEN
      node := node || '{"multiple": false, "shuffle": false}';
      SELECT children || coalesce(jsonb_agg(
          pg_temp.form_inline('question-option', o.line)
            || jsonb_build_object('optionId', pg_temp.form_option_id(id, (o.n - 1)::integer),
              'correct', false, 'feedback', '')
          ORDER BY o.n), '[]')
      INTO children
      FROM unnest(options) WITH ORDINALITY AS o(line, n);
    ELSE
      RAISE EXCEPTION 'a form question of kind % cannot be moved', kind;
  END CASE;
  RETURN node || jsonb_build_object('children', children);
END
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_document(questions jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('root', jsonb_build_object('type', 'root',
    'version', 1, 'direction', null, 'format', '', 'indent', 0,
    'children', CASE WHEN count(*) = 0
      THEN jsonb_build_array(pg_temp.form_inline('paragraph', ''))
      ELSE jsonb_agg(q ORDER BY n) END))
  FROM (
    SELECT n, pg_temp.form_question(item ->> 'id', item ->> 'answer',
      item ->> 'required' = 'required', item ->> 'label', item ->> 'hint',
      pg_temp.form_options(CASE WHEN item ->> 'answer' = 'choice' THEN item ->> 'options' END)) AS q
    FROM jsonb_array_elements(questions) WITH ORDINALITY AS e(item, n)
  ) x
$$;
--> statement-breakpoint
-- An application form's questions in one language, each field borrowing
-- the other language's words where it has none.
CREATE FUNCTION pg_temp.form_admission(questions jsonb, locale text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.form_document(coalesce(jsonb_agg(jsonb_build_object(
      'id', q ->> 'id', 'answer', q ->> 'answer', 'required', q ->> 'required',
      'label', CASE locale WHEN 'ar' THEN pg_temp.form_pick(q ->> 'labelAr', q ->> 'labelEn')
        ELSE pg_temp.form_pick(q ->> 'labelEn', q ->> 'labelAr') END,
      'hint', CASE locale WHEN 'ar' THEN pg_temp.form_pick(q ->> 'hintAr', q ->> 'hintEn')
        ELSE pg_temp.form_pick(q ->> 'hintEn', q ->> 'hintAr') END,
      'options', CASE locale WHEN 'ar' THEN pg_temp.form_pick(q ->> 'optionsAr', q ->> 'optionsEn')
        ELSE pg_temp.form_pick(q ->> 'optionsEn', q ->> 'optionsAr') END)
    ORDER BY n), '[]'))
  FROM jsonb_array_elements(questions) WITH ORDINALITY AS e(q, n)
$$;
--> statement-breakpoint
-- The language an application form was written in: Arabic only where no
-- question has English words and some has Arabic.
CREATE FUNCTION pg_temp.form_primary(questions jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN bool_or(pg_temp.form_trim(q ->> 'labelAr') <> '')
      AND NOT bool_or(pg_temp.form_trim(q ->> 'labelEn') <> '')
    THEN 'ar' ELSE 'en' END
  FROM jsonb_array_elements(questions) AS q
$$;
--> statement-breakpoint
-- Whether an application form has words in its other language at all.
CREATE FUNCTION pg_temp.form_translated(questions jsonb, locale text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(bool_or(pg_temp.form_trim(q ->> CASE locale WHEN 'ar' THEN 'labelAr' ELSE 'labelEn' END) <> ''), false)
  FROM jsonb_array_elements(questions) AS q
$$;
--> statement-breakpoint
-- The response a typed answer was: the option a choice named, by its words
-- among the options the family read, or by its words alone where those
-- options are not known; null for an empty answer.
CREATE FUNCTION pg_temp.form_response(id text, kind text, value text, options text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  given text := pg_temp.form_trim(value);
  place integer;
BEGIN
  IF given = '' THEN
    RETURN null;
  END IF;
  CASE kind
    WHEN 'short', 'date' THEN
      RETURN jsonb_build_object('type', 'text', 'text', given);
    WHEN 'long' THEN
      RETURN jsonb_build_object('type', 'written', 'text', given);
    WHEN 'number' THEN
      RETURN jsonb_build_object('type', 'number', 'text', given);
    WHEN 'choice' THEN
      place := array_position(coalesce(options, '{}'), given);
      RETURN jsonb_build_object('type', 'choice', 'optionIds', jsonb_build_array(
        CASE WHEN place IS NULL THEN md5(id || ':' || given)::uuid::text
          ELSE pg_temp.form_option_id(id, place - 1) END));
    ELSE
      RAISE EXCEPTION 'an answer of kind % cannot be moved', kind;
  END CASE;
END
$$;
--> statement-breakpoint
-- A kept answer (`EnquiryAnswer`) as `FormAnswer`, in the same words.
CREATE FUNCTION pg_temp.form_answer(answer jsonb, options text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id', answer ->> 'id',
    'kind', CASE answer ->> 'kind' WHEN 'short' THEN 'text' WHEN 'date' THEN 'text'
      WHEN 'long' THEN 'written' ELSE answer ->> 'kind' END,
    'prompt', coalesce(answer ->> 'label', ''),
    'response', pg_temp.form_response(answer ->> 'id', answer ->> 'kind', answer ->> 'value', options),
    'text', coalesce(answer ->> 'value', ''))
    || CASE WHEN answer ->> 'kind' = 'date' THEN '{"date": true}'::jsonb ELSE '{}'::jsonb END
$$;
--> statement-breakpoint
-- A question of an application form version, found by its id.
CREATE FUNCTION pg_temp.form_asked(questions jsonb, id text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT q FROM jsonb_array_elements(questions) AS q WHERE q ->> 'id' = id LIMIT 1
$$;
--> statement-breakpoint
-- The options of an application form's question in the language read.
CREATE FUNCTION pg_temp.form_asked_options(question jsonb, locale text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.form_options(CASE locale
    WHEN 'ar' THEN pg_temp.form_pick(question ->> 'optionsAr', question ->> 'optionsEn')
    ELSE pg_temp.form_pick(question ->> 'optionsEn', question ->> 'optionsAr') END)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_sections(sections jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(CASE
      WHEN s ->> 'type' = 'form' AND jsonb_typeof(s -> 'data' -> 'questions') = 'array'
      THEN jsonb_set(s, '{data,questions}', pg_temp.form_document(s -> 'data' -> 'questions'))
      ELSE s END ORDER BY n), '[]')
  FROM jsonb_array_elements(sections) WITH ORDINALITY AS e(s, n)
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.form_page(content jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(content -> 'sections') = 'array'
    THEN jsonb_set(content, '{sections}', pg_temp.form_sections(content -> 'sections'))
    ELSE content END
$$;
--> statement-breakpoint
-- A published page holds each section with the language it is shown in.
CREATE FUNCTION pg_temp.form_published(content jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(content -> 'sections') = 'array'
    THEN jsonb_set(content, '{sections}', (
      SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(item -> 'section') = 'object'
          THEN jsonb_set(item, '{section}',
            pg_temp.form_sections(jsonb_build_array(item -> 'section')) -> 0)
          ELSE item END ORDER BY n), '[]')
      FROM jsonb_array_elements(content -> 'sections') WITH ORDINALITY AS e(item, n)))
    ELSE content END
$$;
--> statement-breakpoint
-- The options a published form section offered in one language, for the
-- enquiries sent from it.
CREATE FUNCTION pg_temp.form_published_options(
  t uuid, page uuid, locale text, section uuid, question text
) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT pg_temp.form_options(item ->> 'options')
  FROM core.site_published_pages p,
    jsonb_array_elements(CASE WHEN jsonb_typeof(p.content -> 'sections') = 'array'
      THEN p.content -> 'sections' ELSE '[]' END) AS s,
    jsonb_array_elements(CASE WHEN jsonb_typeof(s -> 'section' -> 'data' -> 'questions') = 'array'
      THEN s -> 'section' -> 'data' -> 'questions' ELSE '[]' END) AS item
  WHERE p.tenant_id = t AND p.page_id = page AND p.locale = form_published_options.locale
    AND s -> 'section' ->> 'id' = section::text AND item ->> 'id' = question
  ORDER BY p.status = 'active' DESC
  LIMIT 1
$$;
--> statement-breakpoint
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    -- Answers first, while the forms they were given on still read as they did.
    UPDATE core.site_enquiries x
    SET answers = (
      SELECT coalesce(jsonb_agg(pg_temp.form_answer(a, CASE WHEN a ->> 'kind' = 'choice'
          THEN pg_temp.form_published_options(t, x.page_id, x.locale, x.section_id, a ->> 'id') END)
        ORDER BY n), '[]')
      FROM jsonb_array_elements(x.answers) WITH ORDINALITY AS e(a, n))
    WHERE x.tenant_id = t AND x.answers <> '[]'
      AND NOT jsonb_path_exists(x.answers, '$[*].response');

    UPDATE core.admission_applications x
    SET answers = (
      SELECT coalesce(jsonb_agg(pg_temp.form_answer(a, pg_temp.form_asked_options(
          pg_temp.form_asked(v.questions, a ->> 'id'), x.locale)) ORDER BY n), '[]')
      FROM jsonb_array_elements(x.answers) WITH ORDINALITY AS e(a, n))
    FROM core.admission_form_versions v
    WHERE x.tenant_id = t AND v.tenant_id = t AND v.id = x.form_version_id
      AND x.answers <> '[]' AND NOT jsonb_path_exists(x.answers, '$[*].response');

    UPDATE core.admission_applications x
    SET form = (x.form - 'questions') || jsonb_build_object('answers', (
      SELECT coalesce(jsonb_object_agg(d.key, d.response), '{}')
      FROM (
        SELECT e.key, pg_temp.form_response(e.key, q ->> 'answer', e.value,
          pg_temp.form_asked_options(q, x.locale)) AS response
        FROM jsonb_each_text(x.form -> 'questions') AS e,
          LATERAL (SELECT pg_temp.form_asked(v.questions, e.key) AS q) asked
        WHERE q IS NOT NULL
      ) d
      WHERE d.response IS NOT NULL))
    FROM core.admission_form_versions v
    WHERE x.tenant_id = t AND v.tenant_id = t AND v.id = x.form_version_id
      AND x.form ? 'questions';

    UPDATE core.admission_forms
    SET primary_locale = pg_temp.form_primary(questions),
      body = pg_temp.form_admission(questions, pg_temp.form_primary(questions)),
      translation = CASE WHEN pg_temp.form_translated(questions,
          CASE pg_temp.form_primary(questions) WHEN 'ar' THEN 'en' ELSE 'ar' END)
        THEN pg_temp.form_admission(questions,
          CASE pg_temp.form_primary(questions) WHEN 'ar' THEN 'en' ELSE 'ar' END) END
    WHERE tenant_id = t AND body IS NULL;

    UPDATE core.admission_form_versions
    SET primary_locale = pg_temp.form_primary(questions),
      body = pg_temp.form_admission(questions, pg_temp.form_primary(questions)),
      translation = CASE WHEN pg_temp.form_translated(questions,
          CASE pg_temp.form_primary(questions) WHEN 'ar' THEN 'en' ELSE 'ar' END)
        THEN pg_temp.form_admission(questions,
          CASE pg_temp.form_primary(questions) WHEN 'ar' THEN 'en' ELSE 'ar' END) END
    WHERE tenant_id = t AND body IS NULL;

    UPDATE core.documents
    SET content = pg_temp.form_page(content)
    WHERE tenant_id = t AND host_type = 'site_page'
      AND jsonb_path_exists(content, '$.sections[*] ? (@.type == "form" && @.data.questions.type() == "array")');

    UPDATE core.document_versions v
    SET content = pg_temp.form_page(v.content)
    FROM core.documents d
    WHERE v.tenant_id = t AND d.tenant_id = t AND v.document_id = d.id
      AND d.host_type = 'site_page'
      AND jsonb_path_exists(v.content, '$.sections[*] ? (@.type == "form" && @.data.questions.type() == "array")');

    UPDATE core.document_translations r
    SET content = pg_temp.form_page(r.content)
    FROM core.documents d
    WHERE r.tenant_id = t AND d.tenant_id = t AND r.document_id = d.id
      AND d.host_type = 'site_page'
      AND jsonb_path_exists(r.content, '$.sections[*] ? (@.type == "form" && @.data.questions.type() == "array")');

    UPDATE core.site_published_pages
    SET content = pg_temp.form_published(content)
    WHERE tenant_id = t
      AND jsonb_path_exists(content, '$.sections[*].section ? (@.type == "form" && @.data.questions.type() == "array")');
  END LOOP;
END
$$;
