-- What the generated migration cannot express for a school's reading
-- norms: the row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.reading_norms for each row execute function app.row_meta();

alter table core.reading_norms force row level security;

grant select, insert, update on core.reading_norms to app, worker, cell_io;
grant select on core.reading_norms to retention;

-- An erased student's quiz answers lose how their reading was marked too.
grant update (fluency) on core.quiz_answers to retention;
