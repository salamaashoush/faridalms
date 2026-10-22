-- What the generated migration cannot express for peer reviews: forced row
-- level security, the grants, including what erasing a student needs, and
-- the version and dates every row changed in place keeps.

alter table core.peer_reviews force row level security;

grant select, insert, update on core.peer_reviews to app, worker, cell_io;
grant select on core.peer_reviews to retention;
grant update (status, metadata) on core.peer_reviews to retention;
grant delete on core.peer_reviews to retention;

create trigger row_meta before insert or update on core.peer_reviews for each row execute function app.row_meta();
