-- What the generated migration cannot express for outside tools: forced row
-- level security, the grants, and the version and dates every row changed
-- in place keeps. Replay digests are only added and swept away.

alter table core.lti_tools force row level security;
alter table core.lti_keys force row level security;
alter table core.lti_replays force row level security;

grant select, insert, update on core.lti_tools, core.lti_keys to app, worker, cell_io;
grant select on core.lti_tools, core.lti_keys to retention;
grant select, insert on core.lti_replays to app, worker;
grant select, delete on core.lti_replays to retention;

create trigger row_meta before insert or update on core.lti_tools for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lti_keys for each row execute function app.row_meta();
