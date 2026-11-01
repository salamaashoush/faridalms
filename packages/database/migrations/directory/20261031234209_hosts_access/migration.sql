-- A cell binds its own schools' hosts for their site managers and records what
-- its verification worker finds, through directory_sync. It may add a host and
-- change its role, challenge, canonical flag and state, but never rename one or
-- move it to another school; the operator console, as directory_admin, already
-- holds every right on hosts. Slugs are public, and the worker needs them for
-- the CNAME target it expects.
grant select on hosts to directory_sync;
grant insert (hostname, school_id, role, challenge) on hosts to directory_sync;
grant update (role, challenge, canonical, state, state_changed_at, verified_at, checked_at, last_error, failures)
  on hosts to directory_sync;
grant select (slug) on schools to directory_sync;
