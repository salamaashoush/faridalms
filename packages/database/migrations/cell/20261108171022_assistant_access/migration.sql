-- What the generated migration cannot express for a school's language model
-- settings and the requests its teachers send: forced row level security,
-- the grants, and the version and dates every row changed in place keeps.
-- A request names the member of staff who sent it and stays as the school's
-- record of what left it.

alter table core.assistant_settings force row level security;
alter table core.assistant_requests force row level security;

grant select, insert, update on core.assistant_settings, core.assistant_requests to app, worker, cell_io;
grant select on core.assistant_settings, core.assistant_requests to retention;

create trigger row_meta before insert or update on core.assistant_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assistant_requests for each row execute function app.row_meta();
