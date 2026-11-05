-- The portal's sign-in, registration and apply pages are now the app's own
-- built-in pages, no longer pages a school makes in the website builder.
-- Each school's portal pages are removed as the builder removes a page: the
-- pictures they made public stop being published, visitors' copies are
-- withdrawn and the pages are marked for deletion. The objects already
-- copied to public storage are not reached from here and stay until a sweep
-- of ended publications removes them.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.file_publications p
    SET unpublished_at = statement_timestamp()
    FROM core.site_pages s
    WHERE p.tenant_id = t AND s.tenant_id = t
      AND p.host_type = 'site_page' AND p.host_id = s.id
      AND s.kind = 'portal'
      AND p.status = 'active' AND p.unpublished_at IS NULL;

    UPDATE core.site_published_pages
    SET status = 'tobedeleted'
    WHERE tenant_id = t AND kind = 'portal' AND status = 'active';

    UPDATE core.site_pages
    SET status = 'tobedeleted'
    WHERE tenant_id = t AND kind = 'portal' AND status = 'active';
  END LOOP;
END $$;
