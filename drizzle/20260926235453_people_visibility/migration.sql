-- Which students a person reaches at a school. Capabilities decide whether a
-- procedure runs; this decides which records it reads. Students of a school
-- still importing are reached by nobody until the flip.
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
    select s.student_user_id from core.student_school_years s, school
    where s.tenant_id = app.tenant_id() and s.org_id = school.id and s.status = 'active'
    union
    select r.user_id from core.user_roles r, school
    where r.tenant_id = app.tenant_id() and r.org_id = school.id and r.role = 'student' and r.status = 'active'
  )
  select m.student_user_id from members m where p_school_wide
  union
  select r.student_user_id from core.user_relationships r
  where r.tenant_id = app.tenant_id() and r.related_user_id = p_viewer and r.status = 'active'
    and r.portal_access and r.valid_during @> p_on
    and r.student_user_id in (select student_user_id from members)
  union
  select m.student_user_id from members m where m.student_user_id = p_viewer
$$;

revoke all on function app.visible_students(uuid, uuid, date, boolean) from public;
grant execute on function app.visible_students(uuid, uuid, date, boolean) to app;
