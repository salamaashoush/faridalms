-- A student's answer is one document that holds their files as blocks. Files
-- a draft kept beside the answer become blocks at its end, in the answer's
-- keeping as media; a draft with files and no answer yet gets one. Work
-- already handed in is frozen and keeps its files beside it.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    INSERT INTO core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version,
      content, plain_text, last_edited_by_user_id, last_edited_at)
    SELECT DISTINCT s.tenant_id, 'submission', s.id, a.org_id, 'rich_text', 1,
      '{"root":{"type":"root","version":1,"direction":null,"format":"","indent":0,"children":[]}}'::jsonb,
      '', s.student_user_id, statement_timestamp()
    FROM core.files f
    JOIN core.submissions s ON s.tenant_id = f.tenant_id AND s.id = f.host_id
    JOIN core.assignments a ON a.tenant_id = s.tenant_id AND a.id = s.assignment_id
    WHERE f.tenant_id = t AND f.host_type = 'submission' AND f.purpose = 'submission'
      AND f.status = 'active' AND f.state = 'ready'
      AND NOT EXISTS (
        SELECT 1 FROM core.documents d
        WHERE d.tenant_id = s.tenant_id AND d.host_type = 'submission' AND d.host_id = s.id
          AND d.status = 'active');

    UPDATE core.documents d
    SET content = jsonb_set(d.content, '{root,children}',
      coalesce(d.content->'root'->'children', '[]'::jsonb) || drafts.nodes),
      ydoc = null
    FROM (
      SELECT f.host_id AS submission_id,
        jsonb_agg(jsonb_build_object(
          'type', 'file', 'version', 1, 'format', '',
          'fileId', f.id, 'name', f.name, 'mime', f.media_type, 'bytes', f.size_bytes)
          ORDER BY f.created_at, f.id) AS nodes
      FROM core.files f
      WHERE f.tenant_id = t AND f.host_type = 'submission' AND f.purpose = 'submission'
        AND f.status = 'active' AND f.state = 'ready'
      GROUP BY f.host_id) drafts
    WHERE d.tenant_id = t AND d.host_type = 'submission' AND d.host_id = drafts.submission_id
      AND d.status = 'active' AND d.frozen_at IS NULL;

    UPDATE core.files
    SET purpose = 'document_media'
    WHERE tenant_id = t AND host_type = 'submission' AND purpose = 'submission'
      AND status = 'active' AND state = 'ready';

    INSERT INTO core.document_files (tenant_id, document_id, file_id, file_purpose)
    SELECT t, d.id, f.id, 'document_media'
    FROM core.files f
    JOIN core.documents d ON d.tenant_id = f.tenant_id AND d.host_type = 'submission'
      AND d.host_id = f.host_id AND d.status = 'active' AND d.frozen_at IS NULL
    WHERE f.tenant_id = t AND f.host_type = 'submission' AND f.purpose = 'document_media'
      AND f.status = 'active' AND f.state = 'ready'
      AND position(f.id::text IN d.content::text) > 0
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
