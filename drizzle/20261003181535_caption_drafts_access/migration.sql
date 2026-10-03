-- What the generated migration cannot express for caption drafts: forced row
-- level security, the grants, and the version and dates every updatable row
-- keeps. A draft is updated in place as the media service works on it.

alter table core.caption_drafts force row level security;

grant select, insert, update on core.caption_drafts to app, worker, cell_io;
grant select on core.caption_drafts to retention;

create trigger row_meta before insert or update on core.caption_drafts for each row execute function app.row_meta();
