-- The API finds which tenants hold a sign-in name through directory_reader,
-- and each cell keeps its own tenants' keys current through directory_sync.
-- The operator console has no use for them and gets no grant.
grant select on login_index to directory_reader;
grant select, insert, delete on login_index to directory_sync;
