-- What the generated migration cannot express for a website's redirects: the
-- row trigger, forced row level security and the grants. The site role reads
-- where an old address leads, never who added the redirect.

create trigger row_meta before insert or update on core.site_redirects for each row execute function app.row_meta();

alter table core.site_redirects force row level security;

grant select, insert, update on core.site_redirects to app, worker, cell_io;
grant select on core.site_redirects to retention;
grant select (tenant_id, id, org_id, from_path, to_page_id, to_url, status)
  on core.site_redirects to site;
