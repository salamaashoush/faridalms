-- A school had two logos and two first languages: the school's own, used
-- for print, and its website's, used by the website and the sign-in pages.
-- The school's become the only ones.
--
-- The website was written first in its own language, so that language
-- becomes the school's, and its pages keep reading the same way.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.orgs o
    SET default_locale = s.primary_locale
    FROM core.site_settings s
    WHERE o.tenant_id = t AND s.tenant_id = t AND s.org_id = o.id
      AND s.status = 'active';

    UPDATE core.orgs o
    SET default_locale = n.default_locale
    FROM core.tenants n
    WHERE o.tenant_id = t AND n.tenant_id = t AND o.default_locale IS NULL;
  END LOOP;
END $$;
--> statement-breakpoint
-- Where the website named a logo, that is the logo strangers already see, so
-- it becomes the school's, belonging to the school and keeping its public
-- copy; a school whose website named none keeps its own.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.orgs o
    SET logo_file_id = f.id
    FROM core.site_settings s
    JOIN core.files f ON f.tenant_id = s.tenant_id
      AND f.id = (s.chrome ->> 'logoFileId')::uuid AND f.status = 'active'
    WHERE o.tenant_id = t AND s.tenant_id = t AND s.org_id = o.id
      AND s.status = 'active' AND jsonb_typeof(s.chrome -> 'logoFileId') = 'string';

    UPDATE core.files f
    SET host_type = 'org', host_id = o.id,
      linked_at = coalesce(f.linked_at, statement_timestamp())
    FROM core.orgs o
    WHERE f.tenant_id = t AND o.tenant_id = t AND f.id = o.logo_file_id
      AND f.host_type IS NULL;

    UPDATE core.file_publications p
    SET host_type = 'org', host_id = s.org_id
    FROM core.site_settings s
    WHERE p.tenant_id = t AND s.tenant_id = t AND p.host_type = 'site_settings'
      AND p.host_id = s.id AND p.status = 'active'
      AND jsonb_typeof(s.chrome -> 'logoFileId') = 'string'
      AND p.file_id = (s.chrome ->> 'logoFileId')::uuid;

    UPDATE core.site_settings
    SET chrome = chrome - 'logoFileId'
    WHERE tenant_id = t AND chrome ? 'logoFileId';
  END LOOP;
END $$;
