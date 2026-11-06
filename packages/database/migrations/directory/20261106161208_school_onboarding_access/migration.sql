-- A cell reads its schools' steps for their administrators and records the
-- ones its measure sees; a step, once taken, is never moved.
grant select on school_onboarding to directory_reader;
grant select, insert on school_onboarding to directory_sync;
-- The console records the first invoice paid and the steps operators tick,
-- and takes back a tick made in error.
grant select, insert, delete on school_onboarding to directory_admin;
