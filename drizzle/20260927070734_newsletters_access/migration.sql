-- What the generated migration cannot express for newsletters: row triggers,
-- forced row level security and the grants of the access profiles.

create trigger row_meta before insert or update on core.newsletters for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.newsletter_audiences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.newsletter_recipients for each row execute function app.row_meta();

alter table core.newsletters force row level security;
alter table core.newsletter_audiences force row level security;
alter table core.newsletter_recipients force row level security;

grant select, insert, update on core.newsletters, core.newsletter_audiences, core.newsletter_recipients
  to app, worker, cell_io;
grant select on core.newsletters, core.newsletter_audiences, core.newsletter_recipients to retention;
