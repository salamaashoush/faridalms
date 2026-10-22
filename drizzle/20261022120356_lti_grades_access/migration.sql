-- What the generated migration cannot express for grades from outside
-- tools: forced row level security, the grants, and the version and dates
-- every row changed in place keeps. A student's scores go when they are
-- erased.

alter table core.lti_line_items force row level security;
alter table core.lti_scores force row level security;

grant select, insert, update on core.lti_line_items, core.lti_scores to app, worker, cell_io;
grant select on core.lti_line_items, core.lti_scores to retention;
grant update (status, metadata) on core.lti_scores to retention;
grant delete on core.lti_scores to retention;

create trigger row_meta before insert or update on core.lti_line_items for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lti_scores for each row execute function app.row_meta();
