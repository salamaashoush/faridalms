-- What the generated migration cannot express for calendar feeds: the row
-- trigger, forced row level security and the grants. Retention may erase a
-- person's feed with the rest of what is theirs.

create trigger row_meta before insert or update on core.calendar_feeds for each row execute function app.row_meta();

alter table core.calendar_feeds force row level security;

grant select, insert, update on core.calendar_feeds to app, worker, cell_io;
grant select on core.calendar_feeds to retention;
grant update (status, metadata) on core.calendar_feeds to retention;
grant delete on core.calendar_feeds to retention;
