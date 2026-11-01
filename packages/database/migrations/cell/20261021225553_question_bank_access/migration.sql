-- What the generated migration cannot express for the question bank:
-- forced row level security, the grants, and the version and dates every
-- row updated in place keeps. A kept question is changed in place and
-- tombstoned when taken out.

alter table core.bank_questions force row level security;

grant select, insert, update on core.bank_questions to app, worker, cell_io;
grant select on core.bank_questions to retention;

create trigger row_meta before insert or update on core.bank_questions for each row execute function app.row_meta();
