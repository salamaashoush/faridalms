-- A student who has left is the school's record, no longer the family's to
-- follow. A guardian, and the student, reach a student only while a
-- placement or the student role at the school has not ended; the role
-- carries the time a leaver keeps, to the start of the next school year
-- unless the office ended it on the last day. Staff reach is as it was: the
-- office every student the school has had, a teacher those in class today.
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
  ), staying as (
    select s.student_user_id from core.student_school_years s, school
    where s.tenant_id = app.tenant_id() and s.org_id = school.id and s.status = 'active'
      and upper(s.valid_during) > p_on
    union
    select r.user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.role = 'student' and r.status = 'active'
      and (upper_inf(r.valid_during) or upper(r.valid_during) > p_on)
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
    and r.student_user_id in (select s.student_user_id from staying s)
  union
  select s.student_user_id from staying s where s.student_user_id = p_viewer
  union
  select e.user_id from core.enrollments e
  where e.tenant_id = app.tenant_id() and e.role = 'student' and e.status = 'active' and e.valid_during @> p_on
    and e.class_id in (select class_id from taught)
    and e.user_id in (select student_user_id from members)
$$;

-- Students who left before this rule hold a role that never ended. Each
-- ends where the rule would have ended it: when the school year after the
-- one they left in began, or, where the school has set up no later year,
-- when their last placement ended.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    with last_placement as (
      select distinct on (s.org_id, s.student_user_id)
             s.org_id, s.student_user_id, s.exit_type_descriptor_id, upper(s.valid_during) as ended
      from core.student_school_years s
      where s.tenant_id = t and s.status = 'active'
      order by s.org_id, s.student_user_id, upper(s.valid_during) desc
    ), leavers as (
      select l.org_id, l.student_user_id,
             coalesce((
               select min(lower(y.span)) from core.academic_sessions y
               where y.tenant_id = t and y.org_id = l.org_id and y.type = 'school_year'
                 and y.status = 'active' and lower(y.span) >= l.ended
             ), l.ended) as until
      from last_placement l
      where l.exit_type_descriptor_id is not null
    )
    update core.user_roles r
    set valid_during = daterange(lower(r.valid_during), greatest(l.until, lower(r.valid_during) + 1))
    from leavers l
    where r.tenant_id = t and r.org_id = l.org_id and r.user_id = l.student_user_id
      and r.role = 'student' and r.status = 'active' and upper_inf(r.valid_during);
  end loop;
end $$;
