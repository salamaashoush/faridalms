-- What the generated migration cannot express for timed quiz sittings:
-- forced row level security, the grants, and the version and dates every
-- row updated in place keeps. A sitting is closed in place when its attempt
-- is handed in, by the student or by the worker when its time runs out.

alter table core.quiz_sittings force row level security;

grant select, insert, update on core.quiz_sittings to app, worker, cell_io;
grant select on core.quiz_sittings to retention;

create trigger row_meta before insert or update on core.quiz_sittings for each row execute function app.row_meta();
