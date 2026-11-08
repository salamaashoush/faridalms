-- What the generated migration cannot express for course packages'
-- registrations, sessions and the documents their units keep: forced row
-- level security, the grants, and the version and dates every row changed
-- in place keeps. A student's go when they are erased.

alter table core.cmi5_registrations force row level security;
alter table core.cmi5_sessions force row level security;
alter table core.cmi5_states force row level security;

grant select, insert, update on core.cmi5_registrations, core.cmi5_sessions, core.cmi5_states to app, worker, cell_io;
grant select on core.cmi5_registrations, core.cmi5_sessions, core.cmi5_states to retention;
grant update (status, metadata) on core.cmi5_registrations, core.cmi5_sessions, core.cmi5_states to retention;
grant delete on core.cmi5_registrations, core.cmi5_sessions, core.cmi5_states to retention;

create trigger row_meta before insert or update on core.cmi5_registrations for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.cmi5_sessions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.cmi5_states for each row execute function app.row_meta();
