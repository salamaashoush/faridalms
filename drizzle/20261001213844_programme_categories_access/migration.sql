-- What the generated migration cannot express for programme categories:
-- the row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.programme_categories for each row execute function app.row_meta();

alter table core.programme_categories force row level security;

grant select, insert, update on core.programme_categories to app, worker, cell_io;
grant select on core.programme_categories to retention;
