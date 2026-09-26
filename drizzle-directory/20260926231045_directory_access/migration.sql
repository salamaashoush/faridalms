-- The directory holds no personal data. Readers route requests, the operator
-- tool administers it, and the cell sync job copies school names from Settings.
revoke all on schema public from public;
grant usage on schema public to directory_reader, directory_admin, directory_sync;

grant select on cells, tenants, schools, hosts, sso_domains, integration_clients to directory_reader;
grant select, insert, update, delete on cells, tenants, schools, hosts, sso_domains, integration_clients
  to directory_admin;
grant select, insert on changes to directory_admin;
grant select (id, name_en, name_ar, updated_at), update (name_en, name_ar, updated_at) on schools
  to directory_sync;
grant insert on changes to directory_sync;
