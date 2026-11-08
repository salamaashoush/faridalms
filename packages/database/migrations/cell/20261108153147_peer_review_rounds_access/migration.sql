-- What the generated migration cannot express for reviewers' passage
-- comments: the row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.peer_review_comments for each row execute function app.row_meta();

alter table core.peer_review_comments force row level security;

grant select, insert, update on core.peer_review_comments to app, worker, cell_io;
grant select on core.peer_review_comments to retention;
grant update (status, metadata) on core.peer_review_comments to retention;
grant delete on core.peer_review_comments to retention;
