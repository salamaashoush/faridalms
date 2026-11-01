-- What the generated migration cannot express for website enquiries: the row
-- trigger, forced row level security and the grants. The site role adds
-- enquiries and reads back only the columns it needs to slow a flood from
-- one network, never a visitor's name, address or message.

create trigger row_meta before insert or update on core.site_enquiries for each row execute function app.row_meta();

alter table core.site_enquiries force row level security;

grant select, insert, update on core.site_enquiries to app, worker, cell_io;
grant select on core.site_enquiries to retention;
grant insert on core.site_enquiries to site;
grant select (tenant_id, org_id, network_key, status, created_at) on core.site_enquiries to site;
