-- What the generated migration cannot express for class groups and
-- coursework: row triggers, forced row level security, the grants of the
-- access profiles, and attempts that never change once handed in.

create trigger row_meta before insert or update on core.class_groups for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_group_members for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assignments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assignment_recipients for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.submissions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.submission_attempts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assessments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.rubrics for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.period_grades for each row execute function app.row_meta();

alter table core.class_groups force row level security;
alter table core.class_group_members force row level security;
alter table core.assignments force row level security;
alter table core.assignment_recipients force row level security;
alter table core.submissions force row level security;
alter table core.submission_attempts force row level security;
alter table core.assessments force row level security;
alter table core.rubrics force row level security;
alter table core.period_grades force row level security;

grant select, insert, update on core.class_groups, core.class_group_members, core.assignments,
  core.assignment_recipients, core.submissions, core.assessments, core.rubrics, core.period_grades
  to app, worker, cell_io;
-- An attempt is a snapshot: the application may add one and tombstone it, never rewrite it.
grant select, insert on core.submission_attempts to app, worker;
grant update (status, metadata) on core.submission_attempts to app, worker;
grant select, insert, update on core.submission_attempts to cell_io;
grant select on core.class_groups, core.class_group_members, core.assignments,
  core.assignment_recipients, core.submissions, core.submission_attempts, core.assessments,
  core.rubrics, core.period_grades to retention;
grant select on core.assignments, core.assessments, core.period_grades to integration;
