-- What the generated migration cannot express for comment replies and
-- answers: the row triggers, forced row level security and the grants.

create trigger row_meta before insert or update on core.work_comment_replies for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.work_comment_answers for each row execute function app.row_meta();

alter table core.work_comment_replies force row level security;
alter table core.work_comment_answers force row level security;

grant select, insert, update on core.work_comment_replies, core.work_comment_answers to app, worker, cell_io;
grant select on core.work_comment_replies, core.work_comment_answers to retention;
