-- What the generated migration cannot express for lesson releases: forced
-- row level security, the grants, and the version and dates every row
-- changed in place keeps.

alter table core.lesson_releases force row level security;

grant select, insert, update on core.lesson_releases to app, worker, cell_io;
grant select on core.lesson_releases to retention;

create trigger row_meta before insert or update on core.lesson_releases for each row execute function app.row_meta();
