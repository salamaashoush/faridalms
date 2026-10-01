-- What the generated migration cannot express for family shares: the row
-- trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.family_shares for each row execute function app.row_meta();

alter table core.family_shares force row level security;

grant select, insert, update on core.family_shares to app, worker, cell_io;
grant select on core.family_shares to retention;
