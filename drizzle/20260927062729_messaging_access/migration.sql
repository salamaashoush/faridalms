-- What the generated migration cannot express for messaging: row triggers,
-- forced row level security and the grants of the access profiles.

create trigger row_meta before insert or update on core.message_threads for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.thread_members for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.messages for each row execute function app.row_meta();

alter table core.message_threads force row level security;
alter table core.thread_members force row level security;
alter table core.messages force row level security;

grant select, insert, update on core.message_threads, core.thread_members, core.messages to app, worker, cell_io;
grant select on core.message_threads, core.thread_members, core.messages to retention;
