-- Which people a person reaches at a school, beyond students: themselves,
-- their colleagues, and, for school-wide staff, everyone who holds or held a
-- role there or is linked to one of its students.
create function app.visible_people(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
returns table (user_id uuid)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  with school as (
    select o.id from core.orgs o
    where o.tenant_id = app.tenant_id() and o.id = p_school and o.type = 'school'
      and o.lifecycle = 'active' and o.status = 'active'
  ), staff_roles(role) as (
    values ('teacher'), ('aide'), ('counselor'), ('principal'), ('site_administrator'),
           ('district_administrator'), ('system_administrator'), ('proctor'), ('staff')
  ), viewer_is_staff as (
    select exists (
      select 1 from core.user_roles r, school
      where r.tenant_id = app.tenant_id() and r.user_id = p_viewer and r.org_id = school.id
        and r.status = 'active' and r.valid_during @> p_on and r.role in (select role from staff_roles)
    ) as yes
  ), members as (
    select r.user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.status = 'active'
    union
    select l.related_user_id from core.user_relationships l
    where l.tenant_id = app.tenant_id() and l.status = 'active'
      and l.student_user_id in (select student_user_id from app.visible_students(p_viewer, p_school, p_on, true))
  )
  select p_viewer where exists (select 1 from school)
  union
  select m.user_id from members m where p_school_wide
  union
  select r.user_id from core.user_roles r, school, viewer_is_staff
  where viewer_is_staff.yes and r.tenant_id = app.tenant_id() and r.org_id = school.id
    and r.status = 'active' and r.valid_during @> p_on and r.role in (select role from staff_roles)
$$;

revoke all on function app.visible_people(uuid, uuid, date, boolean) from public;
grant execute on function app.visible_people(uuid, uuid, date, boolean) to app;
