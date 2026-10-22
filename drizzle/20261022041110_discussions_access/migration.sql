-- What the generated migration cannot express for discussion posts: forced
-- row level security, the grants, including what erasing an author needs,
-- and the version and dates every row changed in place keeps.

alter table core.discussion_posts force row level security;

grant select, insert, update on core.discussion_posts to app, worker, cell_io;
grant select on core.discussion_posts to retention;
grant update (content, plain_text, redacted_at) on core.discussion_posts to retention;

create trigger row_meta before insert or update on core.discussion_posts for each row execute function app.row_meta();
