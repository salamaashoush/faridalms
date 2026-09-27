-- What the generated migration cannot express for lesson responses: forced
-- row level security and the grants. Answers are a ledger: added, never
-- changed or removed by the app.

alter table core.lesson_responses force row level security;

grant select, insert on core.lesson_responses to app, worker, cell_io;
grant select on core.lesson_responses to retention;
