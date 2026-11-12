-- Bodies are checked when they first run, since most read tables that the
-- migrations after this one create.
set local check_function_bodies = off;

create function app.tenant_id() returns uuid
language plpgsql stable parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare v text := current_setting('app.tenant_id', true);
begin
  if v is null or v = ''
     or current_setting('app.tenant_txn', true) is distinct from
        ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text then
    raise exception 'tenant context is not set' using errcode = '42501';
  end if;
  return v::uuid;
end $$;
revoke all on function app.tenant_id() from public;
grant execute on function app.tenant_id() to app, site, integration, worker, collab, cell_io,
  retention;

create function app.user_id() returns uuid
language sql stable parallel safe
set search_path = pg_catalog, pg_temp
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
revoke all on function app.user_id() from public;
grant execute on function app.user_id() to app, site, integration, worker, collab, cell_io,
  retention;

create function app.tenant_lifecycle() returns text
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select lifecycle from ops.tenant_registry where tenant_id = app.tenant_id() $$;
revoke all on function app.tenant_lifecycle() from public;
grant execute on function app.tenant_lifecycle() to app, site, integration, worker, collab, cell_io,
  retention;

-- Each unit of work reads, with the tenant's lifecycle, how many times the
-- operator console has changed what its schools may use, so a server holding
-- the tenant's directory rows knows at once that they are stale.
create function app.tenant_entitlements_version() returns integer
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select entitlements_version from ops.tenant_registry where tenant_id = app.tenant_id() $$;
revoke all on function app.tenant_entitlements_version() from public;
grant execute on function app.tenant_entitlements_version() to app, site, integration, worker,
  collab, cell_io, retention;

create function app.begin_unit(p_tenant uuid, p_user uuid, p_account uuid, p_session uuid, p_request text, p_actor text)
returns table (lifecycle text, entitlements_version integer)
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform set_config('app.tenant_id', p_tenant::text, true),
          set_config('app.tenant_txn', ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text, true),
          set_config('app.user_id', coalesce(p_user::text, ''), true),
          set_config('app.account_id', coalesce(p_account::text, ''), true),
          set_config('app.session_id', coalesce(p_session::text, ''), true),
          set_config('app.request_id', coalesce(p_request, ''), true),
          set_config('app.actor_kind', coalesce(p_actor, 'system'), true),
          set_config('app.purpose', '', true);
  return query select app.tenant_lifecycle(), app.tenant_entitlements_version();
end $$;
revoke all on function app.begin_unit(uuid, uuid, uuid, uuid, text, text) from public;
grant execute on function app.begin_unit(uuid, uuid, uuid, uuid, text, text) to app, site,
  integration, worker, collab, cell_io, retention;

create function app.lock(key text) returns void
language sql
set search_path = pg_catalog, pg_temp
as $$ select pg_advisory_xact_lock(hashtextextended(app.tenant_id()::text || ':' || key, 0)) $$;
revoke all on function app.lock(text) from public;
grant execute on function app.lock(text) to app, site, integration, worker, collab, cell_io,
  retention;

-- The schema owner keeps the times it writes, as the importer does: an
-- operator filling a school with its history (a demonstration, a move from
-- another system) dates each message and record when it happened. The
-- application's runtime roles never act as the owner, so what they write is
-- still stamped with the moment of writing.
create function app.row_meta() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('cell_io', 'cell_owner') then
      new.version := 1;
      new.date_last_modified := statement_timestamp();
      new.created_at := statement_timestamp();
    end if;
  else
    if new.id <> old.id then
      raise exception 'id is immutable' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.date_last_modified := statement_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke all on function app.row_meta() from public;

create function app.row_meta_keyed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('cell_io', 'cell_owner') then
      new.version := 1;
      new.date_last_modified := statement_timestamp();
      new.created_at := statement_timestamp();
    end if;
  else
    if (to_jsonb(new) -> tg_argv[0]) is distinct from (to_jsonb(old) -> tg_argv[0]) then
      raise exception '% is immutable', tg_argv[0] using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.date_last_modified := statement_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke all on function app.row_meta_keyed() from public;

create function audit.hash_row() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user <> 'cell_io' then
    new.occurred_at := statement_timestamp();
    new.actor_kind := coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system');
    new.actor_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
    new.session_id := nullif(current_setting('app.session_id', true), '')::uuid;
    new.request_id := nullif(current_setting('app.request_id', true), '');
  end if;
  new.row_hash := sha256(convert_to(jsonb_build_array(
    new.tenant_id, new.id, (extract(epoch from new.occurred_at) * 1000000)::bigint,
    new.actor_kind, new.actor_user_id, new.session_id, new.action, new.outcome,
    new.object_type, new.object_id, new.org_id, new.subject_user_id, new.student_user_id, new.request_id,
    new.details, encode(new.payload_digest, 'hex'))::text, 'UTF8'));
  return new;
end $$;
revoke all on function audit.hash_row() from public;

create function audit.check_payload() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  digest bytea;
begin
  select l.payload_digest into digest from audit.log l
  where l.tenant_id = new.tenant_id and l.occurred_at = new.occurred_at and l.id = new.event_id
    and (current_user = 'cell_io' or l.occurred_at >= transaction_timestamp());
  if digest is null
     or digest <> sha256(new.salt || convert_to(jsonb_build_array(new.before, new.after)::text, 'UTF8')) then
    raise exception 'payload does not match its audit row' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function audit.check_payload() from public;

create function audit.refuse_change() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception '% on %.% is not allowed', tg_op, tg_table_schema, tg_table_name using errcode = '42501';
end $$;
revoke all on function audit.refuse_change() from public;

-- An erasure names a person or an outside contact, and either reaches the
-- rows that name it. A legal hold names people only: a contact who never
-- had an account has none.
create function app.erasure_approved(p_tenant uuid, p_subject uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_subject is not null
    and exists (select 1 from core.erasure_approvals a
                where a.tenant_id = p_tenant
                  and (a.subject_user_id = p_subject or a.subject_contact_id = p_subject))
    and not exists (select 1 from core.legal_holds h
                    where h.tenant_id = p_tenant and h.subject_user_id = p_subject
                      and h.status = 'active' and h.released_at is null)
$$;
revoke all on function app.erasure_approved(uuid, uuid) from public;
grant execute on function app.erasure_approved(uuid, uuid) to retention;

create function app.erasure_listed(p_tenant uuid, p_type text, p_object uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from core.erasure_items i
                 join core.erasure_approvals a on a.tenant_id = i.tenant_id and a.id = i.approval_id
                 where i.tenant_id = p_tenant and i.object_type = p_type and i.object_id = p_object
                   and app.erasure_approved(a.tenant_id, coalesce(a.subject_user_id, a.subject_contact_id)))
$$;
revoke all on function app.erasure_listed(uuid, text, uuid) from public;
grant execute on function app.erasure_listed(uuid, text, uuid) to retention;

create function app.documents_frozen_guard() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.host_type is distinct from old.host_type or new.host_id is distinct from old.host_id then
    raise exception 'document host is immutable' using errcode = '55000';
  end if;
  if old.frozen_at is not null and current_user <> 'retention' and (new.content is distinct from old.content
      or new.ydoc is distinct from old.ydoc or new.plain_text is distinct from old.plain_text
      or new.frozen_at is distinct from old.frozen_at) then
    raise exception 'document % is frozen', old.id using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function app.documents_frozen_guard() from public;

create function app.change_year_span(p_year_id uuid, p_span daterange, p_expected_version integer)
returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  y record;
  removed integer;
begin
  perform app.lock('year:' || p_year_id::text);
  select s.tenant_id, s.id, s.org_id, s.span, s.lifecycle, s.version into y
  from core.academic_sessions s
  where s.tenant_id = app.tenant_id() and s.id = p_year_id and s.type = 'school_year' and s.status = 'active'
  for update;
  if not found then
    raise exception 'school year % not found', p_year_id using errcode = 'P0002';
  end if;
  if y.version <> p_expected_version then
    raise exception 'school year % has changed', p_year_id using errcode = 'F0412';
  end if;
  if y.lifecycle = 'closed' then
    raise exception 'school year % is closed', p_year_id using errcode = '55000';
  end if;
  if exists (select 1 from core.academic_sessions s where s.tenant_id = y.tenant_id
               and s.school_year_id = y.id and s.id <> y.id and s.status = 'active' and not p_span @> s.span)
     or exists (select 1 from core.academic_weeks w where w.tenant_id = y.tenant_id
               and w.school_year_id = y.id and w.status = 'active' and not p_span @> w.span)
     or exists (select 1 from core.class_periods p where p.tenant_id = y.tenant_id
               and p.school_year_id = y.id and p.status = 'active' and not p_span @> p.valid_during)
     or exists (select 1 from core.student_school_years r where r.tenant_id = y.tenant_id
               and r.school_year_id = y.id and r.status = 'active' and not p_span @> r.valid_during)
     or exists (select 1 from core.attendance_registers g where g.tenant_id = y.tenant_id
               and g.school_year_id = y.id and not p_span @> g.taken_on)
     or exists (select 1 from core.class_meetings c where c.tenant_id = y.tenant_id
               and c.school_year_id = y.id and c.status = 'active' and not p_span @> c.valid_during) then
    raise exception 'active rows of school year % fall outside %', p_year_id, p_span using errcode = '23514';
  end if;
  delete from core.calendar_dates d
  where d.tenant_id = y.tenant_id and d.school_year_id = y.id and not p_span @> d.day_on;
  get diagnostics removed = row_count;
  delete from core.academic_weeks w
  where w.tenant_id = y.tenant_id and w.school_year_id = y.id and w.status = 'tobedeleted' and not p_span @> w.span;
  delete from core.class_periods p
  where p.tenant_id = y.tenant_id and p.school_year_id = y.id and p.status = 'tobedeleted'
    and not p_span @> p.valid_during;
  delete from core.class_meetings c
  where c.tenant_id = y.tenant_id and c.school_year_id = y.id and c.status = 'tobedeleted'
    and not p_span @> c.valid_during;
  delete from core.student_school_years r
  where r.tenant_id = y.tenant_id and r.school_year_id = y.id and r.status = 'tobedeleted'
    and not p_span @> r.valid_during;
  delete from core.academic_sessions s
  where s.tenant_id = y.tenant_id and s.school_year_id = y.id and s.id <> y.id and s.status = 'tobedeleted'
    and not p_span @> s.span;
  update core.academic_sessions set span = p_span where tenant_id = y.tenant_id and id = y.id;
  insert into audit.log (tenant_id, action, object_type, object_id, org_id, details)
  values (y.tenant_id, 'academic_session.span_change', 'academic_session', y.id, y.org_id,
          jsonb_build_object('from', y.span::text, 'to', p_span::text, 'removed_calendar_dates', removed));
  return removed;
end $$;
revoke all on function app.change_year_span(uuid, daterange, integer) from public;
grant execute on function app.change_year_span(uuid, daterange, integer) to app;

create function app.staff_roles() returns text[]
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select array['teacher', 'aide', 'counselor', 'principal', 'site_administrator',
    'district_administrator', 'system_administrator', 'proctor', 'staff']
$$;
revoke all on function app.staff_roles() from public;
grant execute on function app.staff_roles() to app, worker;

-- A role held at the school or at a group it belongs to.
create function app.is_staff(p_viewer uuid, p_school uuid, p_on date) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with recursive path as (
    select o.id, o.parent_id from core.orgs o
    where o.tenant_id = app.tenant_id() and o.id = p_school
    union all
    select o.id, o.parent_id from core.orgs o join path p on o.id = p.parent_id
    where o.tenant_id = app.tenant_id()
  )
  select exists (
    select 1 from core.user_roles r
    where r.tenant_id = app.tenant_id() and r.user_id = p_viewer and r.org_id in (select id from path)
      and r.status = 'active' and r.valid_during @> p_on and r.role = any (app.staff_roles()))
$$;
revoke all on function app.is_staff(uuid, uuid, date) from public;
grant execute on function app.is_staff(uuid, uuid, date) to app, worker;

create function app.visible_students(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
returns table (student_user_id uuid)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with school as (
    select o.id from core.orgs o
    where o.tenant_id = app.tenant_id() and o.id = p_school and o.type = 'school'
      and o.lifecycle = 'active' and o.status = 'active'
  ), members as (
    select r.user_id as student_user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.role = 'student' and r.status = 'active'
  ), staying as (
    select r.user_id as student_user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.role = 'student' and r.status = 'active'
      and (upper_inf(r.valid_during) or upper(r.valid_during) > p_on)
    union
    select d.student_user_id from core.student_departures d, school
    where d.tenant_id = app.tenant_id() and d.org_id = school.id and d.status = 'active'
      and d.access_ends_on > p_on
  ), taught as (
    select c.id as class_id
    from core.enrollments t
    join core.classes c on c.tenant_id = t.tenant_id and c.id = t.class_id and c.status = 'active'
    join school on c.org_id = school.id
    where t.tenant_id = app.tenant_id() and t.user_id = p_viewer and t.role in ('teacher', 'aide')
      and t.status = 'active' and t.valid_during @> p_on
  )
  select m.student_user_id from members m where p_school_wide
  union
  select r.student_user_id from core.user_relationships r
  where r.tenant_id = app.tenant_id() and r.related_user_id = p_viewer
    and app.guardian_permits(r, p_on, 'follow')
    and r.student_user_id in (select s.student_user_id from staying s)
  union
  select s.student_user_id from staying s where s.student_user_id = p_viewer
  union
  select e.user_id from core.enrollments e
  where e.tenant_id = app.tenant_id() and e.role = 'student' and e.status = 'active' and e.valid_during @> p_on
    and e.class_id in (select class_id from taught)
    and e.user_id in (select student_user_id from members)
$$;
revoke all on function app.visible_students(uuid, uuid, date, boolean) from public;
grant execute on function app.visible_students(uuid, uuid, date, boolean) to app;

create function app.visible_people(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
returns table (user_id uuid)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with recursive school as (
    select o.id from core.orgs o
    where o.tenant_id = app.tenant_id() and o.id = p_school and o.type = 'school'
      and o.lifecycle = 'active' and o.status = 'active'
  ), path as (
    select o.id, o.parent_id from core.orgs o, school
    where o.tenant_id = app.tenant_id() and o.id = school.id
    union all
    select o.id, o.parent_id from core.orgs o join path p on o.id = p.parent_id
    where o.tenant_id = app.tenant_id()
  ), viewer_is_staff as (
    select app.is_staff(p_viewer, p_school, p_on) as yes
  ), members as (
    select r.user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.status = 'active'
    union
    select r.user_id from core.user_roles r
    where r.tenant_id = app.tenant_id() and r.org_id in (select id from path) and r.status = 'active'
      and r.role = any (app.staff_roles())
    union
    select l.related_user_id from core.user_relationships l
    where l.tenant_id = app.tenant_id() and l.status = 'active'
      and l.student_user_id in (select student_user_id from app.visible_students(p_viewer, p_school, p_on, true))
  )
  select p_viewer where exists (select 1 from school)
  union
  select m.user_id from members m where p_school_wide
  union
  select r.user_id from core.user_roles r, viewer_is_staff
  where viewer_is_staff.yes and r.tenant_id = app.tenant_id() and r.org_id in (select id from path)
    and r.status = 'active' and r.valid_during @> p_on and r.role = any (app.staff_roles())
  union
  select l.related_user_id from core.user_relationships l, viewer_is_staff
  where viewer_is_staff.yes and not p_school_wide and l.tenant_id = app.tenant_id() and l.status = 'active'
    and l.valid_during @> p_on
    and l.student_user_id in (select student_user_id from app.visible_students(p_viewer, p_school, p_on, false))
$$;
revoke all on function app.visible_people(uuid, uuid, date, boolean) from public;
grant execute on function app.visible_people(uuid, uuid, date, boolean) to app;

create function app.visible_classes(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
returns table (class_id uuid)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with school as (
    select o.id from core.orgs o
    where o.tenant_id = app.tenant_id() and o.id = p_school and o.type = 'school'
      and o.lifecycle = 'active' and o.status = 'active'
  ), children as (
    select r.student_user_id from core.user_relationships r
    where r.tenant_id = app.tenant_id() and r.related_user_id = p_viewer
      and app.guardian_permits(r, p_on, 'follow')
  ), joined as (
    select e.class_id from core.enrollments e, school
    where e.tenant_id = app.tenant_id() and e.org_id = school.id and e.status = 'active'
      and e.valid_during @> p_on
      and (e.user_id = p_viewer or (e.role = 'student' and e.user_id in (select student_user_id from children)))
  )
  select c.id from core.classes c, school
  where c.tenant_id = app.tenant_id() and c.org_id = school.id and c.status = 'active'
    and (p_school_wide or c.id in (select class_id from joined))
$$;
revoke all on function app.visible_classes(uuid, uuid, date, boolean) from public;
grant execute on function app.visible_classes(uuid, uuid, date, boolean) to app;

-- How far the viewer reaches each person: their whole record, as
-- app.visible_people decides, or a limited profile. The profile opens for
-- the teachers and aides of the classes the viewer or a child they follow
-- is in, and for the grown-ups who share a conversation with the viewer
-- (in a mailbox conversation, its contacts and its owner, never the team
-- reading along). A student is never reached through a conversation, so a
-- child's profile is not opened to the other families in a group.
create function app.reached_people(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
returns table (user_id uuid, record boolean)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with full_reach as (
    select v.user_id from app.visible_people(p_viewer, p_school, p_on, p_school_wide) v
  ), teaching as (
    select e.user_id from core.enrollments e
    where e.tenant_id = app.tenant_id() and e.role in ('teacher', 'aide') and e.status = 'active'
      and e.valid_during @> p_on
      and e.class_id in (select class_id from app.visible_classes(p_viewer, p_school, p_on, false))
  ), shared as (
    select o.user_id from core.thread_members m
    join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      and t.status = 'active' and t.org_id = p_school
    join core.thread_members o on o.tenant_id = m.tenant_id and o.thread_id = m.thread_id
      and o.status = 'active' and o.left_at is null and o.user_id is not null
      and (t.mailbox is null or o.role <> 'reader')
    where m.tenant_id = app.tenant_id() and m.user_id = p_viewer and m.status = 'active'
      and m.left_at is null and (t.mailbox is null or m.role = 'member')
      and not exists (select 1 from core.user_roles s
        where s.tenant_id = o.tenant_id and s.user_id = o.user_id and s.org_id = p_school
          and s.role = 'student' and s.status = 'active'
          and (upper_inf(s.valid_during) or upper(s.valid_during) > p_on))
      and not exists (select 1 from core.student_departures d
        where d.tenant_id = o.tenant_id and d.student_user_id = o.user_id and d.org_id = p_school
          and d.status = 'active' and d.access_ends_on > p_on)
  )
  select f.user_id, true from full_reach f
  union
  select p.user_id, false from (select user_id from teaching union select user_id from shared) p
  join core.users u on u.tenant_id = app.tenant_id() and u.id = p.user_id and u.status = 'active'
  where p.user_id not in (select user_id from full_reach)
$$;
revoke all on function app.reached_people(uuid, uuid, date, boolean) from public;
grant execute on function app.reached_people(uuid, uuid, date, boolean) to app;

-- A class's programme: its own, else the one programme covering its grade
-- level. Two programmes sharing the level leave the class to choose.
create function app.programme_of(p_class uuid) returns uuid
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(c.programme_id, (
    select min(p.id::text)::uuid
    from core.programme_grade_levels l
    join core.programmes p on p.tenant_id = l.tenant_id and p.id = l.programme_id
      and p.status = 'active' and p.org_id = c.org_id
    where l.tenant_id = c.tenant_id and l.grade_level_descriptor_id = c.grade_level_descriptor_id
      and l.status = 'active'
    having count(distinct p.id) = 1))
  from core.classes c
  where c.tenant_id = app.tenant_id() and c.id = p_class
$$;
revoke all on function app.programme_of(uuid) from public;
grant execute on function app.programme_of(uuid) to app, worker, cell_io, retention;

-- The bands a class grades on, on a day: the class's own scale, else its
-- programme's, as that scale stood on the day; a correction made the same
-- day is the later version.
create function app.scale_version_of(p_class uuid, p_on date) returns uuid
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select v.id
  from core.classes c
  left join core.programmes p on p.tenant_id = c.tenant_id and p.id = app.programme_of(c.id)
  join core.grade_scales s on s.tenant_id = c.tenant_id
    and s.id = coalesce(c.grade_scale_id, p.grade_scale_id) and s.status = 'active'
  join core.grade_scale_versions v on v.tenant_id = s.tenant_id and v.scale_id = s.id
    and v.status = 'active' and v.effective_from <= p_on
  where c.tenant_id = app.tenant_id() and c.id = p_class
  order by v.effective_from desc, v.created_at desc
  limit 1
$$;
revoke all on function app.scale_version_of(uuid, date) from public;
grant execute on function app.scale_version_of(uuid, date) to app, worker, cell_io, retention;

create function app.normalize_name(t text) returns text
language sql immutable parallel safe strict
set search_path = pg_catalog, pg_temp
as $$
  select lower(translate(
    regexp_replace(t, '[ً-ٰٟـ]', '', 'g'),
    'أإآىة', 'ااايه'))
$$;
revoke all on function app.normalize_name(text) from public;
grant execute on function app.normalize_name(text) to app, worker;

create function app.search(q text, types text[], org_scope uuid[] default null, after_rank real default null, after_id uuid default null, max_rows integer default 50, prefer_on date default null, within uuid[] default null)
returns table (result_type text, result_id uuid, rank real)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with query as (
    select app.normalize_name(q) as norm,
           websearch_to_tsquery('arabic', q) as ar,
           websearch_to_tsquery('english', q) as en
  ), hits as (
    select e.result_type, e.result_id,
           greatest(coalesce(ext.word_similarity(query.norm, e.name_norm), 0),
                    coalesce(ts_rank(e.text_vector, query.ar || query.en), 0))::real as rank
    from search.entries e, query
    where e.tenant_id = app.tenant_id()
      and e.result_type = any (types)
      and (within is null or e.result_id = any (within))
      and (org_scope is null or cardinality(e.org_ids) = 0 or e.org_ids && org_scope)
      and (query.norm operator(ext.<%) e.name_norm
           or e.text_vector @@ query.ar
           or e.text_vector @@ query.en)
  ), best as (
    select h.result_type, h.result_id,
           (max(h.rank) + case when prefer_on is not null and h.result_type = 'class'
              and exists (select 1 from core.classes c
                          where c.tenant_id = app.tenant_id() and c.id = h.result_id
                            and c.runs @> prefer_on)
              then 1 else 0 end)::real as rank
    from hits h group by h.result_type, h.result_id
  )
  select b.result_type, b.result_id, b.rank from best b
  where after_rank is null or (b.rank, b.result_id) < (after_rank, after_id)
  order by b.rank desc, b.result_id desc
  limit least(max_rows, 200)
$$;
revoke all on function app.search(text, text[], uuid[], real, uuid, integer, date, uuid[]) from public;
grant execute on function app.search(text, text[], uuid[], real, uuid, integer, date, uuid[]) to
  app, worker;

create function app.index_user() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.erased_at is not null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'user' and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, name_norm)
  values (new.tenant_id, 'user', new.id, 'user', new.id,
          app.normalize_name(concat_ws(' ', new.full_name_ar, new.full_name_en,
                                       new.preferred_given_name, new.preferred_family_name)))
  on conflict (tenant_id, entity_type, entity_id) do update set name_norm = excluded.name_norm;
  return new;
end $$;
revoke all on function app.index_user() from public;

create function app.index_user_orgs() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update search.entries e set org_ids = coalesce((
    select array_agg(distinct r.org_id order by r.org_id) from core.user_roles r
    where r.tenant_id = new.tenant_id and r.user_id = new.user_id and r.status = 'active'
      and (upper_inf(r.valid_during)
           or upper(r.valid_during) > (statement_timestamp() at time zone 'UTC')::date)), '{}')
  where e.tenant_id = new.tenant_id and e.entity_type = 'user' and e.entity_id = new.user_id;
  return new;
end $$;
revoke all on function app.index_user_orgs() from public;

-- Only its writer reads a draft, so nothing of it is searchable; a
-- message's document is found through the message, never on its own.
create function app.index_document() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.host_type in ('message', 'message_draft') then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'document' and entity_id = new.id;
    delete from search.entries e where e.tenant_id = new.tenant_id and e.entity_type = 'document_translation'
      and e.entity_id in (select t.id from core.document_translations t
                          where t.tenant_id = new.tenant_id and t.document_id = new.id);
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, text_vector)
  values (new.tenant_id, 'document', new.id, new.host_type, new.host_id,
          case when new.org_id is null then '{}'::uuid[] else array[new.org_id] end,
          to_tsvector('arabic'::regconfig, left(new.plain_text, 200000))
          || to_tsvector('english'::regconfig, left(new.plain_text, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, org_ids = excluded.org_ids;
  return new;
end $$;
revoke all on function app.index_document() from public;

create function app.index_translation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  d record;
begin
  if new.status <> 'active' then
    delete from search.entries
    where tenant_id = new.tenant_id and entity_type = 'document_translation' and entity_id = new.id;
    return new;
  end if;
  select host_type, host_id, org_id into d from core.documents
  where tenant_id = new.tenant_id and id = new.document_id;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, text_vector)
  values (new.tenant_id, 'document_translation', new.id, d.host_type, d.host_id,
          case when d.org_id is null then '{}'::uuid[] else array[d.org_id] end,
          to_tsvector((case new.target_locale when 'ar' then 'arabic' else 'english' end)::regconfig,
                      left(new.plain_text, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, org_ids = excluded.org_ids;
  return new;
end $$;
revoke all on function app.index_translation() from public;

create function app.index_host() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  r jsonb := to_jsonb(new);
  kind text := tg_argv[0];
  names text;
begin
  select nullif(trim(string_agg(r->>tg_argv[i], ' ')), '') into names
  from generate_series(1, tg_nargs - 1) as i;
  if r->>'status' <> 'active' or names is null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = kind and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, name_norm)
  values (new.tenant_id, kind, new.id, kind, new.id,
          case when r->>'org_id' is null then '{}'::uuid[] else array[(r->>'org_id')::uuid] end,
          app.normalize_name(names))
  on conflict (tenant_id, entity_type, entity_id)
    do update set name_norm = excluded.name_norm, org_ids = excluded.org_ids;
  return new;
end $$;
revoke all on function app.index_host() from public;

-- A team searches its own internal entries: notes, logged calls, meetings
-- and emails, and held mail. Each is indexed under the result type
-- `team_thread`, which search offers only among the conversations of the
-- mailboxes the viewer reads, so a family that finds its conversation by a
-- word is still never shown a staff note: its own conversations are found
-- as `message_thread`, from messages alone. A recorded change stays out.
create function app.index_message() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.kind = 'event' or new.redacted_at is not null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'message' and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, text_vector)
  values (new.tenant_id, 'message', new.id,
          case when new.kind = 'message' then 'message_thread' else 'team_thread' end, new.thread_id,
          to_tsvector('arabic'::regconfig, left(new.body, 200000))
          || to_tsvector('english'::regconfig, left(new.body, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, result_type = excluded.result_type;
  return new;
end $$;
revoke all on function app.index_message() from public;

create function app.ensure_partitions(months_ahead integer default 3, since date default null)
returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  parent record;
  step interval;
  m date;
  last_start date;
  made integer := 0;
  part text;
begin
  for parent in select schema_name, table_name, period from ops.partitioned_tables loop
    step := case parent.period when 'month' then interval '1 month' else interval '1 year' end;
    m := date_trunc(parent.period,
           coalesce(since, (statement_timestamp() at time zone 'UTC')::date)::timestamp)::date;
    last_start := date_trunc(parent.period,
           (statement_timestamp() at time zone 'UTC') + make_interval(months => months_ahead))::date;
    while m <= last_start loop
      part := format('%s_%s_%s', parent.schema_name, parent.table_name,
                     to_char(m, case parent.period when 'month' then 'YYYY_MM' else 'YYYY' end));
      if to_regclass(format('parts.%I', part)) is null then
        execute format('create table parts.%I partition of %I.%I for values from (%L) to (%L)',
          part, parent.schema_name, parent.table_name,
          m::timestamp at time zone 'UTC', (m + step)::timestamp at time zone 'UTC');
        made := made + 1;
      end if;
      m := (m + step)::date;
    end loop;
  end loop;
  return made;
end $$;
revoke all on function app.ensure_partitions(integer, date) from public;
grant execute on function app.ensure_partitions(integer, date) to worker;
