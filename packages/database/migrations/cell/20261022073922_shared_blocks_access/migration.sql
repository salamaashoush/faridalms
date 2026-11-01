-- What the generated migration cannot express for shared blocks: forced
-- row level security, the grants, and the version and dates every row
-- updated in place keeps. A shared block is changed in place and
-- tombstoned when taken out.

alter table core.shared_blocks force row level security;

grant select, insert, update on core.shared_blocks to app, worker, cell_io;
grant select on core.shared_blocks to retention;

create trigger row_meta before insert or update on core.shared_blocks for each row execute function app.row_meta();
