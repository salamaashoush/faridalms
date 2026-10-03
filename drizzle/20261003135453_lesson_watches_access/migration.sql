-- What the generated migration cannot express for lesson watches: forced row
-- level security and the grants. A watch is updated in place as a student
-- plays more of a recording.

alter table core.lesson_watches force row level security;

grant select, insert, update on core.lesson_watches to app, worker, cell_io;
grant select on core.lesson_watches to retention;
