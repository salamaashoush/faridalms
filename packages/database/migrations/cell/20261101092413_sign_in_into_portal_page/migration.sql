-- A school's sign-in page was a document in its own editor and table, beside
-- the website. It becomes the school's portal page in the site builder: a
-- Sign-in section, then a text section holding the words the school wrote.
-- A document's host never changes, so the page gets documents of its own with
-- the same words and files, and the old ones are tombstoned. The published
-- copies become the page's published copies and the public pictures move with
-- them, so strangers see what they saw before. A school that never wrote one
-- shows the builder's starter page until it makes its own.
DO $$
DECLARE
  t uuid;
  s record;
  original record;
  other record;
  author uuid;
  page uuid;
  sign_in uuid;
  words uuid;
  made uuid;
  made_other uuid;
  shown boolean;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');
    FOR s IN
      SELECT d.org_id
      FROM core.documents d
      WHERE d.tenant_id = t AND d.host_type = 'site_sign_in' AND d.status = 'active'
        AND d.translation_of_id IS NULL AND d.org_id IS NOT NULL
      GROUP BY d.org_id
    LOOP
      SELECT d.id, d.locale, d.content, d.plain_text, d.last_edited_by_user_id,
        d.last_edited_at
      INTO original
      FROM core.documents d
      WHERE d.tenant_id = t AND d.host_type = 'site_sign_in' AND d.host_id = s.org_id
        AND d.status = 'active' AND d.translation_of_id IS NULL
      ORDER BY d.date_last_modified DESC LIMIT 1;
      author := coalesce(original.last_edited_by_user_id, (
        SELECT r.user_id FROM core.user_roles r
        WHERE r.tenant_id = t AND r.org_id = s.org_id AND r.status = 'active'
          AND r.role IN ('principal', 'site_administrator')
        ORDER BY r.role, r.user_id LIMIT 1));
      CONTINUE WHEN author IS NULL;
      shown := EXISTS (
        SELECT 1 FROM core.site_published_sign_in p
        WHERE p.tenant_id = t AND p.org_id = s.org_id AND p.status = 'active');
      sign_in := gen_random_uuid();
      words := gen_random_uuid();

      INSERT INTO core.site_pages (tenant_id, org_id, kind, slug, in_menu, title_en, title_ar,
        state, published_at, author_user_id)
      VALUES (t, s.org_id, 'portal', 'sign-in', false, 'Sign in', 'تسجيل الدخول',
        CASE WHEN shown THEN 'published' ELSE 'draft' END,
        CASE WHEN shown THEN statement_timestamp() END, author)
      RETURNING id INTO page;

      INSERT INTO core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version,
        locale, content, plain_text, last_edited_by_user_id, last_edited_at)
      VALUES (t, 'site_page', page, s.org_id, 'page', 1, original.locale,
        jsonb_build_object(
          'sections', jsonb_build_array(
            jsonb_build_object('id', sign_in, 'type', 'signIn', 'variant', 'split',
              'style', '{}'::jsonb,
              'data', jsonb_build_object('eyebrow', '', 'text', '',
                'heading', CASE WHEN original.locale = 'ar' THEN 'تسجيل الدخول' ELSE 'Sign in' END)),
            jsonb_build_object('id', words, 'type', 'text', 'variant', 'narrow',
              'style', '{}'::jsonb,
              'data', jsonb_build_object('eyebrow', '', 'heading', '', 'body', original.content))),
          'description', '', 'reviewed', '[]'::jsonb),
        original.plain_text, original.last_edited_by_user_id, original.last_edited_at)
      RETURNING id INTO made;
      INSERT INTO core.document_files (tenant_id, document_id, file_id, file_purpose)
      SELECT tenant_id, made, file_id, file_purpose FROM core.document_files
      WHERE tenant_id = t AND document_id = original.id AND status = 'active';

      FOR other IN
        SELECT d.id, d.locale, d.content, d.plain_text, d.last_edited_by_user_id,
          d.last_edited_at
        FROM core.documents d
        WHERE d.tenant_id = t AND d.translation_of_id = original.id AND d.status = 'active'
      LOOP
        INSERT INTO core.documents (tenant_id, host_type, host_id, org_id, kind,
          schema_version, locale, translation_of_id, content, plain_text,
          last_edited_by_user_id, last_edited_at)
        VALUES (t, 'site_page', page, s.org_id, 'page', 1, other.locale, made,
          jsonb_build_object(
            'sections', jsonb_build_array(
              jsonb_build_object('id', sign_in, 'type', 'signIn', 'variant', 'split',
                'style', '{}'::jsonb,
                'data', jsonb_build_object('eyebrow', '', 'text', '',
                  'heading', CASE WHEN other.locale = 'ar' THEN 'تسجيل الدخول' ELSE 'Sign in' END)),
              jsonb_build_object('id', words, 'type', 'text', 'variant', 'narrow',
                'style', '{}'::jsonb,
                'data', jsonb_build_object('eyebrow', '', 'heading', '', 'body', other.content))),
            'description', '', 'reviewed', jsonb_build_array(sign_in, words)),
          other.plain_text, other.last_edited_by_user_id, other.last_edited_at)
        RETURNING id INTO made_other;
        INSERT INTO core.document_files (tenant_id, document_id, file_id, file_purpose)
        SELECT tenant_id, made_other, file_id, file_purpose FROM core.document_files
        WHERE tenant_id = t AND document_id = other.id AND status = 'active';
      END LOOP;

      UPDATE core.documents SET status = 'tobedeleted'
      WHERE tenant_id = t AND host_type = 'site_sign_in' AND host_id = s.org_id
        AND status = 'active';

      INSERT INTO core.site_published_pages (tenant_id, page_id, org_id, kind, locale, slug,
        parent_id, position, is_home, in_menu, title, content, media, visible_from)
      SELECT t, page, s.org_id, 'portal', p.locale, 'sign-in', null, 0, false, false,
        CASE WHEN p.locale = 'ar' THEN 'تسجيل الدخول' ELSE 'Sign in' END,
        jsonb_build_object(
          'sections', jsonb_build_array(
            jsonb_build_object('locale', p.locale, 'section',
              jsonb_build_object('id', sign_in, 'type', 'signIn', 'variant', 'split',
                'style', '{}'::jsonb,
                'data', jsonb_build_object('eyebrow', '', 'text', '',
                  'heading', CASE WHEN p.locale = 'ar' THEN 'تسجيل الدخول' ELSE 'Sign in' END))),
            jsonb_build_object('locale', coalesce(p.content->>'locale', p.locale), 'section',
              jsonb_build_object('id', words, 'type', 'text', 'variant', 'narrow',
                'style', '{}'::jsonb,
                'data', jsonb_build_object('eyebrow', '', 'heading', '',
                  'body', p.content->'body')))),
          'description', ''),
        p.media, statement_timestamp()
      FROM core.site_published_sign_in p
      WHERE p.tenant_id = t AND p.org_id = s.org_id AND p.status = 'active'
        AND p.content ? 'body';

      UPDATE core.file_publications SET host_type = 'site_page', host_id = page
      WHERE tenant_id = t AND host_type = 'site_sign_in' AND host_id = s.org_id;
      UPDATE core.files SET host_type = 'site_page', host_id = page
      WHERE tenant_id = t AND host_type = 'site_sign_in' AND host_id = s.org_id;
    END LOOP;
  END LOOP;
END $$;
