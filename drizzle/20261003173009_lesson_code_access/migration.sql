-- What the generated migration cannot express for a student's own code in a
-- lesson: forced row level security and the grants. It is updated in place
-- as the student changes it.

alter table core.lesson_code force row level security;

grant select, insert, update on core.lesson_code to app, worker, cell_io;
grant select on core.lesson_code to retention;
