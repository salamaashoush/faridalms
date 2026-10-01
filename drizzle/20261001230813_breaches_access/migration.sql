-- What the generated migration cannot express for the breach register:
-- the row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.breaches for each row execute function app.row_meta();

alter table core.breaches force row level security;

grant select, insert, update on core.breaches to app, worker, cell_io;
grant select on core.breaches to retention;
