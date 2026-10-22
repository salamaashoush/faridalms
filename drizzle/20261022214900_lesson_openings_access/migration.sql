-- What the generated migration cannot express for lesson openings: forced
-- row level security, the grants, including what erasing a student needs,
-- and the version and dates every row changed in place keeps.

alter table core.lesson_openings force row level security;

grant select, insert, update on core.lesson_openings to app, worker, cell_io;
grant select on core.lesson_openings to retention;
grant update (status, metadata) on core.lesson_openings to retention;
grant delete on core.lesson_openings to retention;

create trigger row_meta before insert or update on core.lesson_openings for each row execute function app.row_meta();
