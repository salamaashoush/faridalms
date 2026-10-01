-- What the generated migration cannot express for document templates: the
-- row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.document_templates for each row execute function app.row_meta();

alter table core.document_templates force row level security;

grant select, insert, update on core.document_templates to app, worker, cell_io;
grant select on core.document_templates to retention;
