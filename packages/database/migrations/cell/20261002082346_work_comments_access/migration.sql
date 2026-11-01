-- What the generated migration cannot express for work comments: the row
-- trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.work_comments for each row execute function app.row_meta();

alter table core.work_comments force row level security;

grant select, insert, update on core.work_comments to app, worker, cell_io;
grant select on core.work_comments to retention;
