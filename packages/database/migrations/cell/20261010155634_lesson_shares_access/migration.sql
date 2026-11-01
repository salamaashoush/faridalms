-- What the generated migration cannot express for a project offered to the
-- class gallery: forced row level security, the grants, and the version and
-- dates every row updated in place keeps. A share is updated as it is
-- offered again, shown or taken back.

alter table core.lesson_shares force row level security;

grant select, insert, update on core.lesson_shares to app, worker, cell_io;
grant select on core.lesson_shares to retention;

create trigger row_meta before insert or update on core.lesson_shares for each row execute function app.row_meta();
