-- What the generated migration cannot express for program remarks: forced
-- row level security, the grants, and the version and dates every row
-- changed in place keeps.

alter table core.program_remarks force row level security;

grant select, insert, update on core.program_remarks to app, worker, cell_io;
grant select on core.program_remarks to retention;

create trigger row_meta before insert or update on core.program_remarks for each row execute function app.row_meta();
