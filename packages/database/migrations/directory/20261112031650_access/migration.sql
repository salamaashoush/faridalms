-- The directory holds no personal data. Readers route requests, the operator
-- console administers it as directory_admin, and each cell writes what it
-- learns about its own schools as directory_sync.
revoke all on schema public from public;
grant usage on schema public to directory_reader, directory_admin, directory_sync;

grant select on cells, tenants, schools, hosts, sso_domains to directory_reader;
grant select, insert, update, delete on cells, tenants, schools, hosts, sso_domains to directory_admin;
grant select, insert on changes to directory_admin;
grant insert on changes to directory_sync;

-- The sync job copies school names from Settings. Slugs are public, and the
-- verification worker needs them for the CNAME target it expects.
grant select (id, slug, name_en, name_ar, updated_at), update (name_en, name_ar, updated_at)
  on schools to directory_sync;

-- A cell binds its own schools' hosts for their site managers and records what
-- its verification worker finds. It may add a host and change its role,
-- challenge, canonical flag and state, but never rename one or move it to
-- another school.
grant select on hosts to directory_sync;
grant insert (hostname, school_id, role, challenge) on hosts to directory_sync;
grant update (role, challenge, canonical, state, state_changed_at, verified_at, checked_at, last_error, failures)
  on hosts to directory_sync;

-- Cells read a school's plan and entitlements to enforce them and report its
-- usage; only the operator console changes them. A school may hold only as
-- many hosts as it is entitled to, which the transaction adding one reads.
grant select on school_plans, school_entitlements, school_usage to directory_reader;
grant select, insert, update, delete on school_plans, school_entitlements to directory_admin;
grant select (school_id, custom_domains) on school_entitlements to directory_sync;
grant select on school_usage to directory_admin;
grant select, insert, update on school_usage to directory_sync;

-- Each cell writes its schools' daily counts, as it writes their usage; the
-- console reads them.
grant select, insert, update on school_usage_daily to directory_sync;
grant select on school_usage_daily to directory_admin, directory_reader;

-- The API finds which tenants hold a sign-in name through directory_reader,
-- and each cell keeps its own tenants' keys current through directory_sync.
-- The operator console has no use for them and gets no grant.
grant select on login_index to directory_reader;
grant select, insert, delete on login_index to directory_sync;

-- A cell reads its schools' steps for their administrators and records the
-- ones its measure sees; a step, once taken, is never moved. The console
-- records the first invoice paid and the steps operators tick, and takes back
-- a tick made in error.
grant select on school_onboarding to directory_reader;
grant select, insert on school_onboarding to directory_sync;
grant select, insert, delete on school_onboarding to directory_admin;
