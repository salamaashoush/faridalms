-- An assignment's attachments become file blocks at the end of its brief, so
-- the brief is the one place files live. The working brief and every copy
-- readers were given gain the same blocks; the files keep their host and are
-- linked to the brief like any file a document shows. A brief written live
-- loses its stored shared state, so its room starts again from the content.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    WITH resources AS (
      SELECT f.host_id AS assignment_id,
        jsonb_agg(jsonb_build_object(
          'type', 'file', 'version', 1, 'format', '',
          'fileId', f.id, 'name', f.name, 'mime', f.media_type, 'bytes', f.size_bytes)
          ORDER BY f.created_at, f.id) AS nodes,
        array_agg(f.id) AS file_ids
      FROM core.files f
      WHERE f.tenant_id = t AND f.host_type = 'assignment' AND f.purpose = 'attachment'
        AND f.status = 'active' AND f.state = 'ready'
      GROUP BY f.host_id)
    UPDATE core.document_versions v
    SET content = jsonb_set(v.content, '{root,children}',
      coalesce(v.content->'root'->'children', '[]'::jsonb) || r.nodes)
    FROM core.documents d
    JOIN resources r ON r.assignment_id = d.host_id
    WHERE v.tenant_id = t AND d.tenant_id = t AND v.document_id = d.id
      AND d.host_type = 'assignment' AND d.status = 'active'
      AND d.translation_of_id IS NULL AND v.reason = 'publish';

    WITH resources AS (
      SELECT f.host_id AS assignment_id,
        jsonb_agg(jsonb_build_object(
          'type', 'file', 'version', 1, 'format', '',
          'fileId', f.id, 'name', f.name, 'mime', f.media_type, 'bytes', f.size_bytes)
          ORDER BY f.created_at, f.id) AS nodes,
        array_agg(f.id) AS file_ids
      FROM core.files f
      WHERE f.tenant_id = t AND f.host_type = 'assignment' AND f.purpose = 'attachment'
        AND f.status = 'active' AND f.state = 'ready'
      GROUP BY f.host_id)
    UPDATE core.documents d
    SET content = jsonb_set(d.content, '{root,children}',
        coalesce(d.content->'root'->'children', '[]'::jsonb) || r.nodes),
      ydoc = null
    FROM resources r
    WHERE d.tenant_id = t AND d.host_type = 'assignment' AND d.host_id = r.assignment_id
      AND d.status = 'active' AND d.translation_of_id IS NULL;

    WITH resources AS (
      SELECT f.host_id AS assignment_id,
        jsonb_agg(jsonb_build_object(
          'type', 'file', 'version', 1, 'format', '',
          'fileId', f.id, 'name', f.name, 'mime', f.media_type, 'bytes', f.size_bytes)
          ORDER BY f.created_at, f.id) AS nodes,
        array_agg(f.id) AS file_ids
      FROM core.files f
      WHERE f.tenant_id = t AND f.host_type = 'assignment' AND f.purpose = 'attachment'
        AND f.status = 'active' AND f.state = 'ready'
      GROUP BY f.host_id)
    INSERT INTO core.document_files (tenant_id, document_id, file_id, file_purpose)
    SELECT t, d.id, file_id, 'attachment'
    FROM resources r
    JOIN core.documents d ON d.tenant_id = t AND d.host_type = 'assignment'
      AND d.host_id = r.assignment_id AND d.status = 'active' AND d.translation_of_id IS NULL
    CROSS JOIN LATERAL unnest(r.file_ids) AS file_id
    ON CONFLICT DO NOTHING;

  END LOOP;
END $$;
