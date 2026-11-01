-- What the generated migration cannot express for a student's project in a
-- lesson: forced row level security, the grants, and the version and dates
-- every row updated in place keeps. It is updated as the student builds it.

alter table core.lesson_projects force row level security;

grant select, insert, update on core.lesson_projects to app, worker, cell_io;
grant select on core.lesson_projects to retention;

create trigger row_meta before insert or update on core.lesson_projects for each row execute function app.row_meta();
