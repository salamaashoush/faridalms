-- What the generated migration cannot express for comments while writing:
-- the row triggers, forced row level security and the grants.

create trigger row_meta before insert or update on core.document_threads for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_comments for each row execute function app.row_meta();

alter table core.document_threads force row level security;
alter table core.document_comments force row level security;

grant select, insert, update on core.document_threads, core.document_comments to app, worker, cell_io;
grant select on core.document_threads, core.document_comments to retention;
