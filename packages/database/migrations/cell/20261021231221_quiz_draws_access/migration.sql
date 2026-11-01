-- What the generated migration cannot express for quiz draws: forced row
-- level security, the grants, and the version and dates every row keeps. A
-- draw is written once when its attempt starts and only ever read after.

alter table core.quiz_draws force row level security;

grant select, insert, update on core.quiz_draws to app, worker, cell_io;
grant select on core.quiz_draws to retention;

create trigger row_meta before insert or update on core.quiz_draws for each row execute function app.row_meta();
