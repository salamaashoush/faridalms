-- What the generated migration cannot express for year rollovers: the row
-- trigger, forced row level security and the grants of the access profiles.

create trigger row_meta before insert or update on core.year_rollovers for each row execute function app.row_meta();

alter table core.year_rollovers force row level security;

grant select, insert, update on core.year_rollovers to app, worker, cell_io;
grant select on core.year_rollovers to retention;
