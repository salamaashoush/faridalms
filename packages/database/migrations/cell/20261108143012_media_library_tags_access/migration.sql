-- What the generated migration cannot express for the library's tags and
-- texts: forced row level security, the row trigger and the grants.

alter table core.media_tags force row level security;
alter table core.media_item_tags force row level security;
alter table core.media_item_texts force row level security;

grant select, insert, update on core.media_tags, core.media_item_tags, core.media_item_texts to app, worker, cell_io;
grant select on core.media_tags, core.media_item_tags, core.media_item_texts to retention;

create trigger row_meta before insert or update on core.media_tags for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.media_item_tags for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.media_item_texts for each row execute function app.row_meta();
