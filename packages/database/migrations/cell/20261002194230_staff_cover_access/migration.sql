-- What the generated migration cannot express for staff absences and lesson
-- changes: the row triggers, forced row level security and the grants.

create trigger row_meta before insert or update on core.staff_absences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_changes for each row execute function app.row_meta();

alter table core.staff_absences force row level security;
alter table core.lesson_changes force row level security;

grant select, insert, update on core.staff_absences to app, worker, cell_io;
grant select, insert, update on core.lesson_changes to app, worker, cell_io;
grant select on core.staff_absences to retention;
grant select on core.lesson_changes to retention;
