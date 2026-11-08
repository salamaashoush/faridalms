-- What the generated migration cannot express for a school's record
-- store and the statements waiting for it: forced row level security, the
-- grants, and the version and dates every row changed in place keeps. A
-- student's statements go when they are erased.

alter table core.xapi_stores force row level security;
alter table core.xapi_statements force row level security;

grant select, insert, update on core.xapi_stores, core.xapi_statements to app, worker, cell_io;
grant select on core.xapi_stores, core.xapi_statements to retention;
grant update (status, metadata) on core.xapi_statements to retention;
grant delete on core.xapi_statements to retention;

create trigger row_meta before insert or update on core.xapi_stores for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.xapi_statements for each row execute function app.row_meta();
