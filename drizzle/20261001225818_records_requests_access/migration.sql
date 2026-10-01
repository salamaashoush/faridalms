-- What the generated migration cannot express for records requests:
-- the row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.records_requests for each row execute function app.row_meta();

alter table core.records_requests force row level security;

grant select, insert, update on core.records_requests to app, worker, cell_io;
grant select on core.records_requests to retention;
