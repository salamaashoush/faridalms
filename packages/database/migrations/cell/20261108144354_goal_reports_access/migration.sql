-- What the generated migration cannot express for the goals reports shared
-- with families: forced row level security, the grants, including what
-- erasing a child needs, and the version and dates every row changed in
-- place keeps.

alter table core.goal_reports force row level security;

grant select, insert, update on core.goal_reports to app, worker, cell_io;
grant select on core.goal_reports to retention;
grant update (status, metadata) on core.goal_reports to retention;
grant delete on core.goal_reports to retention;

create trigger row_meta before insert or update on core.goal_reports for each row execute function app.row_meta();
