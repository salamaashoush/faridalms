-- What the generated migration cannot express for absence reports: the row
-- trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.absence_reports for each row execute function app.row_meta();

alter table core.absence_reports force row level security;

grant select, insert, update on core.absence_reports to app, worker, cell_io;
grant select on core.absence_reports to retention;
