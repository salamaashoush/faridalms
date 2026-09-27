-- What the generated migration cannot express for quiz answers: the row
-- metadata trigger, forced row level security and the grants. Answers change
-- while an attempt is open and are marked when it is handed in.

create trigger row_meta before insert or update on core.quiz_answers for each row execute function app.row_meta();

alter table core.quiz_answers force row level security;

grant select, insert, update on core.quiz_answers to app, worker, cell_io;
grant select on core.quiz_answers to retention;
