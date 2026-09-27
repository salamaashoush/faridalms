-- What the generated migration cannot express for courses, classes and
-- enrollments: the PERIOD key into the school year, the exclusion
-- constraints, triggers, forced row level security, the grants of the access
-- profiles, and the functions that must learn about the new tables.

alter table core.enrollments add foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.enrollments add constraint enrollments_excl exclude using gist
  (tenant_id with =, class_id with =, user_id with =, role with =, valid_during with &&)
  where (status = 'active');
-- One homeroom at a time for a student within a school's year.
alter table core.enrollments add constraint enrollments_homeroom_excl exclude using gist
  (tenant_id with =, org_id with =, school_year_id with =, user_id with =, valid_during with &&)
  where (status = 'active' and role = 'student' and class_type = 'homeroom');

create trigger row_meta before insert or update on core.courses for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.enrollments for each row execute function app.row_meta();

alter table core.courses force row level security;
alter table core.classes force row level security;
alter table core.enrollments force row level security;

grant select, insert, update on core.courses, core.classes, core.enrollments to app, worker, cell_io;
grant select on core.courses, core.classes, core.enrollments to retention;
grant select on core.courses, core.classes, core.enrollments to integration;
grant update (status, metadata) on core.enrollments to retention;

-- A year's span may not leave enrollments behind; tombstoned ones outside it go.
create or replace function app.change_year_span(p_year_id uuid, p_span daterange, p_expected_version integer)
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
     or exists (select 1 from core.enrollments e where e.tenant_id = y.tenant_id
               and e.school_year_id = y.id and e.status = 'active' and not p_span @> e.valid_during) then
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
  delete from core.student_school_years r
  where r.tenant_id = y.tenant_id and r.school_year_id = y.id and r.status = 'tobedeleted'
    and not p_span @> r.valid_during;
  delete from core.enrollments e
  where e.tenant_id = y.tenant_id and e.school_year_id = y.id and e.status = 'tobedeleted'
    and not p_span @> e.valid_during;
  delete from core.academic_sessions s
  where s.tenant_id = y.tenant_id and s.school_year_id = y.id and s.id <> y.id and s.status = 'tobedeleted'
    and not p_span @> s.span;
  update core.academic_sessions set span = p_span where tenant_id = y.tenant_id and id = y.id;
  insert into audit.log (tenant_id, action, object_type, object_id, org_id, details)
  values (y.tenant_id, 'academic_session.span_change', 'academic_session', y.id, y.org_id,
          jsonb_build_object('from', y.span::text, 'to', p_span::text, 'removed_calendar_dates', removed));
  return removed;
end $$;

-- A teacher or aide of a class reaches the students enrolled in it on the
-- date; a scheduled class that follows a homeroom reaches that homeroom's.
create or replace function app.visible_students(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
returns table (student_user_id uuid)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with school as (
    select o.id from core.orgs o
    where o.tenant_id = app.tenant_id() and o.id = p_school and o.type = 'school'
      and o.lifecycle = 'active' and o.status = 'active'
  ), members as (
    select s.student_user_id from core.student_school_years s, school
    where s.tenant_id = app.tenant_id() and s.org_id = school.id and s.status = 'active'
    union
    select r.user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.role = 'student' and r.status = 'active'
  ), taught as (
    select coalesce(c.homeroom_class_id, c.id) as class_id
    from core.enrollments t
    join core.classes c on c.tenant_id = t.tenant_id and c.id = t.class_id and c.status = 'active'
    join school on c.org_id = school.id
    where t.tenant_id = app.tenant_id() and t.user_id = p_viewer and t.role in ('teacher', 'aide')
      and t.status = 'active' and t.valid_during @> p_on
  )
  select m.student_user_id from members m where p_school_wide
  union
  select r.student_user_id from core.user_relationships r
  where r.tenant_id = app.tenant_id() and r.related_user_id = p_viewer and r.status = 'active'
    and r.portal_access and r.valid_during @> p_on
    and r.student_user_id in (select student_user_id from members)
  union
  select m.student_user_id from members m where m.student_user_id = p_viewer
  union
  select e.user_id from core.enrollments e
  where e.tenant_id = app.tenant_id() and e.role = 'student' and e.status = 'active' and e.valid_during @> p_on
    and e.class_id in (select class_id from taught)
    and e.user_id in (select student_user_id from members)
$$;

-- Staff reach the adults linked to the students they reach, so a teacher can
-- open the guardians of the students they teach. Parents do not reach a
-- co-parent this way.
create or replace function app.visible_people(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
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
  ), staff_roles(role) as (
    values ('teacher'), ('aide'), ('counselor'), ('principal'), ('site_administrator'),
           ('district_administrator'), ('system_administrator'), ('proctor'), ('staff')
  ), viewer_is_staff as (
    select exists (
      select 1 from core.user_roles r
      where r.tenant_id = app.tenant_id() and r.user_id = p_viewer and r.org_id in (select id from path)
        and r.status = 'active' and r.valid_during @> p_on and r.role in (select role from staff_roles)
    ) as yes
  ), members as (
    select r.user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.status = 'active'
    union
    select r.user_id from core.user_roles r
    where r.tenant_id = app.tenant_id() and r.org_id in (select id from path) and r.status = 'active'
      and r.role in (select role from staff_roles)
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
    and r.status = 'active' and r.valid_during @> p_on and r.role in (select role from staff_roles)
  union
  select l.related_user_id from core.user_relationships l, viewer_is_staff
  where viewer_is_staff.yes and not p_school_wide and l.tenant_id = app.tenant_id() and l.status = 'active'
    and l.valid_during @> p_on
    and l.student_user_id in (select student_user_id from app.visible_students(p_viewer, p_school, p_on, false))
$$;
