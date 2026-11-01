-- What the generated migration cannot express for observations against a
-- standard: forced row level security, the grants, including what erasing
-- a student needs, and the version and dates every row changed in place
-- keeps.

alter table core.standard_observations force row level security;

grant select, insert, update on core.standard_observations to app, worker, cell_io;
grant select on core.standard_observations to retention;
grant update (status, metadata) on core.standard_observations to retention;
grant delete on core.standard_observations to retention;

create trigger row_meta before insert or update on core.standard_observations for each row execute function app.row_meta();
