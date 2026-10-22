-- What the generated migration cannot express for module audiences: forced
-- row level security, the grants, including what erasing a student needs,
-- and the version and dates every row changed in place keeps.

alter table core.module_audiences force row level security;

grant select, insert, update on core.module_audiences to app, worker, cell_io;
grant select on core.module_audiences to retention;
grant update (status, metadata) on core.module_audiences to retention;
grant delete on core.module_audiences to retention;

create trigger row_meta before insert or update on core.module_audiences for each row execute function app.row_meta();
