-- What the generated migration cannot express for attendance contacts: the
-- row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.attendance_contacts for each row execute function app.row_meta();

alter table core.attendance_contacts force row level security;

grant select, insert, update on core.attendance_contacts to app, worker, cell_io;
grant select on core.attendance_contacts to retention;
