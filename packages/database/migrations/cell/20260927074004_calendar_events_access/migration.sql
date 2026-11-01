-- What the generated migration cannot express for calendar events: row
-- triggers, forced row level security and the grants of the access profiles.

create trigger row_meta before insert or update on core.calendar_events for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_event_audiences for each row execute function app.row_meta();

alter table core.calendar_events force row level security;
alter table core.calendar_event_audiences force row level security;

grant select, insert, update on core.calendar_events, core.calendar_event_audiences to app, worker, cell_io;
grant select on core.calendar_events, core.calendar_event_audiences to retention;
