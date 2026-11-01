-- What the generated migration cannot express for student movements: the
-- row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.student_movements for each row execute function app.row_meta();

alter table core.student_movements force row level security;

grant select, insert, update on core.student_movements to app, worker, cell_io;
grant select on core.student_movements to retention;
