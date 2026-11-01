-- Cells read a school's plan to enforce it and report its usage; only the
-- operator tool changes a plan.
grant select on school_plans, school_usage to directory_reader;
grant select, insert, update, delete on school_plans to directory_admin;
grant select on school_usage to directory_admin;
grant select, insert, update on school_usage to directory_sync;
