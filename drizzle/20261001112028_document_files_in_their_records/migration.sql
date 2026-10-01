-- A file now opens through the record it belongs to, never through any
-- document that happens to show it. Each picture or file a document holds
-- without a record is given the record of the document it was put in,
-- preferring a handed-in copy, which nothing may rewrite. Where documents of
-- other records show the same file, each of those records gets its own copy
-- of the row, pointing at the same stored object, and its documents and
-- saved versions are rewritten to the copy. Rewritten live documents start
-- their shared state again from the content.
DO $$
DECLARE
  t uuid;
  made record;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.files f
    SET host_type = owner.host_type, host_id = owner.host_id,
      linked_at = coalesce(f.linked_at, statement_timestamp())
    FROM (
      SELECT DISTINCT ON (l.file_id) l.file_id, d.host_type, d.host_id
      FROM core.document_files l
      JOIN core.documents d ON d.tenant_id = l.tenant_id AND d.id = l.document_id
        AND d.status = 'active'
      WHERE l.tenant_id = t AND l.status = 'active'
      ORDER BY l.file_id, d.frozen_at IS NULL, l.created_at, d.created_at) owner
    WHERE f.tenant_id = t AND f.id = owner.file_id AND f.host_type IS NULL
      AND f.status = 'active' AND f.purpose IN ('document_media', 'site_media');

    FOR made IN
      INSERT INTO core.files (tenant_id, uploaded_by_user_id, purpose, name, media_type,
        size_bytes, sha256, state, storage_key, encryption, key_version, scanned_at,
        scan_engine, ready_at, linked_at, width, height, duration_ms, derivatives,
        host_type, host_id, metadata)
      SELECT DISTINCT ON (f.id, d.host_type, d.host_id)
        f.tenant_id, f.uploaded_by_user_id, 'document_media', f.name, f.media_type,
        f.size_bytes, f.sha256, f.state, f.storage_key, f.encryption, f.key_version,
        f.scanned_at, f.scan_engine, f.ready_at, statement_timestamp(), f.width, f.height,
        f.duration_ms, f.derivatives, d.host_type, d.host_id,
        jsonb_build_object('copiedFrom', f.id::text)
      FROM core.document_files l
      JOIN core.documents d ON d.tenant_id = l.tenant_id AND d.id = l.document_id
        AND d.status = 'active' AND d.frozen_at IS NULL
      JOIN core.files f ON f.tenant_id = l.tenant_id AND f.id = l.file_id
        AND f.status = 'active' AND f.state = 'ready'
      WHERE l.tenant_id = t AND l.status = 'active'
        AND f.host_type IS NOT NULL
        AND (f.host_type <> d.host_type OR f.host_id <> d.host_id)
      RETURNING id, host_type, host_id, (metadata->>'copiedFrom')::uuid AS source_id
    LOOP
      UPDATE core.document_versions v
      SET content = replace(v.content::text, made.source_id::text, made.id::text)::jsonb
      FROM core.documents d
      WHERE v.tenant_id = t AND d.tenant_id = t AND v.document_id = d.id
        AND d.host_type = made.host_type AND d.host_id = made.host_id
        AND d.frozen_at IS NULL AND v.redacted_at IS NULL
        AND position(made.source_id::text IN v.content::text) > 0;

      UPDATE core.documents d
      SET content = replace(d.content::text, made.source_id::text, made.id::text)::jsonb,
        ydoc = null
      WHERE d.tenant_id = t AND d.host_type = made.host_type AND d.host_id = made.host_id
        AND d.status = 'active' AND d.frozen_at IS NULL
        AND position(made.source_id::text IN d.content::text) > 0;

      UPDATE core.document_files l
      SET file_id = made.id, file_purpose = 'document_media'
      FROM core.documents d
      WHERE l.tenant_id = t AND d.tenant_id = t AND l.document_id = d.id
        AND d.host_type = made.host_type AND d.host_id = made.host_id
        AND d.frozen_at IS NULL AND l.file_id = made.source_id AND l.status = 'active';
    END LOOP;
  END LOOP;
END $$;
