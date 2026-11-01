-- What the generated migration cannot express for standard evidence: forced
-- row level security, the grants, including what erasing a student needs,
-- and the version and dates every row changed in place keeps.

alter table core.standard_evidence force row level security;

grant select, insert, update on core.standard_evidence to app, worker, cell_io;
grant select on core.standard_evidence to retention;
grant update (status, metadata) on core.standard_evidence to retention;
grant delete on core.standard_evidence to retention;

create trigger row_meta before insert or update on core.standard_evidence for each row execute function app.row_meta();
