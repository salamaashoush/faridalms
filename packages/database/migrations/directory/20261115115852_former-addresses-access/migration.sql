-- A former address routes to its school, so readers resolve it; only the
-- operator console moves a school and frees an address.
grant select on former_slugs to directory_reader;
grant select, insert, update, delete on former_slugs to directory_admin;

-- A cell copies a standalone school's names to its tenant, as it does to the
-- school when they change in the school's settings.
grant select (id, kind), update (name_en, name_ar, updated_at) on tenants to directory_sync;
