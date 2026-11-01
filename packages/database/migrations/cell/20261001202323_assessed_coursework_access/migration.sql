-- What the generated migration cannot express for assessed coursework, its
-- declarations and authentications: the row triggers, forced row level
-- security and the grants.

create trigger row_meta before insert or update on core.coursework_assessments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attempt_declarations for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attempt_authentications for each row execute function app.row_meta();

alter table core.coursework_assessments force row level security;
alter table core.attempt_declarations force row level security;
alter table core.attempt_authentications force row level security;

grant select, insert, update on core.coursework_assessments, core.attempt_declarations, core.attempt_authentications to app, worker, cell_io;
grant select on core.coursework_assessments, core.attempt_declarations, core.attempt_authentications to retention;
