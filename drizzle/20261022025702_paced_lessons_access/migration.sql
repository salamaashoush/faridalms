-- What the generated migration cannot express for paced lessons: forced
-- row level security, the grants, and the version and dates every row
-- changed in place keeps.

alter table core.paced_lessons force row level security;

grant select, insert, update on core.paced_lessons to app, worker, cell_io;
grant select on core.paced_lessons to retention;

create trigger row_meta before insert or update on core.paced_lessons for each row execute function app.row_meta();
