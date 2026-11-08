-- What the generated migration cannot express for file previews: forced row
-- level security, the grants, and the version and dates every updatable row
-- keeps. A preview is updated in place as the media service works on it,
-- and tombstoned by the sweep once no file holds its bytes.

alter table core.file_previews force row level security;

grant select, insert, update on core.file_previews to app, worker, cell_io;
grant select on core.file_previews to retention;

create trigger row_meta before insert or update on core.file_previews for each row execute function app.row_meta();
