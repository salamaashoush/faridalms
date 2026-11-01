-- What the generated migration cannot express for the published sign-in page:
-- the row trigger, forced row level security and the grants. The site role
-- reads the published copy strangers see on the portal's sign-in page, as it
-- reads the website's published pages; the draft stays in core.documents,
-- which it cannot read.

create trigger row_meta before insert or update on core.site_published_sign_in for each row execute function app.row_meta();

alter table core.site_published_sign_in force row level security;

grant select, insert, update on core.site_published_sign_in to app, worker, cell_io;
grant select on core.site_published_sign_in to retention;
grant select on core.site_published_sign_in to site;
