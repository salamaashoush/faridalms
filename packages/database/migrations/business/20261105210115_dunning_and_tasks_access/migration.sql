-- A pause can be ended early; nothing else about it changes.
grant select, insert, update (ends_on) on dunning_pauses to business_admin;
-- A step is taken once and never undone.
grant select, insert on dunning_steps to business_admin;
-- The clock's own change to a tenant, gone once it is undone.
grant select, insert, update, delete on dunning_standings to business_admin;
-- A task is reassigned or closed with what came of it.
grant select, insert, update (assignee_id, done_at, done_by, outcome) on tasks to business_admin;
