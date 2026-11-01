-- What the generated migration cannot express for announcements: row
-- triggers, forced row level security and the grants of the access profiles.

create trigger row_meta before insert or update on core.announcements for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.announcement_audiences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.announcement_recipients for each row execute function app.row_meta();

alter table core.announcements force row level security;
alter table core.announcement_audiences force row level security;
alter table core.announcement_recipients force row level security;

grant select, insert, update on core.announcements, core.announcement_audiences, core.announcement_recipients
  to app, worker, cell_io;
grant select on core.announcements, core.announcement_audiences, core.announcement_recipients to retention;
