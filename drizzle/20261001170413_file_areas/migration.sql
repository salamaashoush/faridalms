-- Files an assignment's or a lesson's document holds now belong to the file
-- area of its class or module, shown wherever that class or module uses
-- them. Copies of one stored object that end up in the same area are folded
-- into one file: documents and their saved versions are rewritten to the
-- file kept, and rewritten live documents start their shared state again
-- from the content. Handed-in work keeps its own copies.
DO $$
DECLARE
  t uuid;
  folded record;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.files f
    SET host_type = 'class', host_id = a.class_id
    FROM core.assignments a
    WHERE f.tenant_id = t AND a.tenant_id = t AND f.host_id = a.id
      AND f.host_type IN ('assignment', 'assignment_quiz')
      AND f.status = 'active' AND f.purpose IN ('document_media', 'attachment');

    UPDATE core.files f
    SET host_type = 'module', host_id = l.module_id
    FROM core.lessons l
    WHERE f.tenant_id = t AND l.tenant_id = t AND f.host_id = l.id
      AND f.host_type = 'lesson'
      AND f.status = 'active' AND f.purpose IN ('document_media', 'attachment');

    FOR folded IN
      WITH ranked AS (
        SELECT f.id, f.purpose, f.host_type, f.host_id, f.storage_key,
          row_number() OVER (
            PARTITION BY f.host_type, f.host_id, f.storage_key
            ORDER BY coalesce(f.metadata ? 'copiedFrom', false), f.created_at, f.id) AS rank
        FROM core.files f
        WHERE f.tenant_id = t AND f.status = 'active' AND f.state = 'ready'
          AND f.host_type IN ('class', 'module'))
      SELECT dup.id AS dup_id, keep.id AS keep_id, keep.purpose AS keep_purpose
      FROM ranked dup
      JOIN ranked keep ON keep.host_type = dup.host_type AND keep.host_id = dup.host_id
        AND keep.storage_key = dup.storage_key AND keep.rank = 1
      WHERE dup.rank > 1
    LOOP
      UPDATE core.document_versions v
      SET content = replace(v.content::text, folded.dup_id::text, folded.keep_id::text)::jsonb
      FROM core.documents d
      WHERE v.tenant_id = t AND d.tenant_id = t AND v.document_id = d.id
        AND d.frozen_at IS NULL AND v.redacted_at IS NULL
        AND position(folded.dup_id::text IN v.content::text) > 0;

      UPDATE core.documents d
      SET content = replace(d.content::text, folded.dup_id::text, folded.keep_id::text)::jsonb,
        ydoc = null
      WHERE d.tenant_id = t AND d.status = 'active' AND d.frozen_at IS NULL
        AND position(folded.dup_id::text IN d.content::text) > 0;

      UPDATE core.document_files l
      SET status = 'tobedeleted'
      WHERE l.tenant_id = t AND l.file_id = folded.dup_id AND l.status = 'active'
        AND EXISTS (
          SELECT 1 FROM core.document_files k
          WHERE k.tenant_id = t AND k.document_id = l.document_id
            AND k.file_id = folded.keep_id AND k.status = 'active');

      UPDATE core.document_files l
      SET file_id = folded.keep_id, file_purpose = folded.keep_purpose
      WHERE l.tenant_id = t AND l.file_id = folded.dup_id AND l.status = 'active';

      UPDATE core.files SET status = 'tobedeleted'
      WHERE tenant_id = t AND id = folded.dup_id;
    END LOOP;
  END LOOP;
END $$;
