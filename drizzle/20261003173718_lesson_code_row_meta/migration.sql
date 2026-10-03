-- A student's code is updated in place, so it carries the version and dates
-- every updatable row keeps, maintained as on every other entity table.
create trigger row_meta before insert or update on core.lesson_code for each row execute function app.row_meta();
