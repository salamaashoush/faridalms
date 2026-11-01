-- What the generated migration cannot express for learning modules: row
-- triggers, forced row level security and the grants of the access profiles.

create trigger row_meta before insert or update on core.learning_modules for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.module_classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lessons for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_progress for each row execute function app.row_meta();

alter table core.learning_modules force row level security;
alter table core.module_classes force row level security;
alter table core.lessons force row level security;
alter table core.lesson_progress force row level security;

grant select, insert, update on core.learning_modules, core.module_classes, core.lessons, core.lesson_progress
  to app, worker, cell_io;
grant select on core.learning_modules, core.module_classes, core.lessons, core.lesson_progress to retention;
