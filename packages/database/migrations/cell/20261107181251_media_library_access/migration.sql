-- What the generated migration cannot express for the media library: the
-- folders' forced row level security, trigger and grants, and the app's
-- right to file a library item in a folder and describe and credit it.

alter table core.media_folders force row level security;

grant select, insert, update on core.media_folders to app, worker, cell_io;
grant select on core.media_folders to retention;

create trigger row_meta before insert or update on core.media_folders for each row execute function app.row_meta();

grant update (folder_id, description, credit) on core.files to app;
