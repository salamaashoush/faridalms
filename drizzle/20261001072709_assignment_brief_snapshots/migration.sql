-- Students now read the brief of work already out as it was last assigned or
-- updated, so each such brief is recorded as published as it reads today;
-- without this, briefs written together live would reach students unreviewed.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    INSERT INTO core.document_versions (tenant_id, document_id, document_version, reason,
      content, plain_text, created_by_user_id)
    SELECT d.tenant_id, d.id, d.version, 'publish', d.content, d.plain_text, a.author_user_id
    FROM core.assignments a
    JOIN core.documents d ON d.tenant_id = a.tenant_id AND d.host_type = 'assignment'
      AND d.host_id = a.id AND d.status = 'active' AND d.translation_of_id IS NULL
    WHERE a.tenant_id = t AND a.state <> 'draft' AND a.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM core.document_versions v
        WHERE v.tenant_id = d.tenant_id AND v.document_id = d.id AND v.reason = 'publish')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
