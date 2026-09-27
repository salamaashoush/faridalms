-- Which classes a person reaches at a school on a date: every class for
-- school-wide staff; otherwise the classes they are enrolled in, those their
-- children are enrolled in, and the homeroom and subject classes tied to
-- either, so a subject teacher can open the homeroom they teach and a family
-- the subjects their child takes.
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
    where r.tenant_id = app.tenant_id() and r.related_user_id = p_viewer and r.status = 'active'
      and r.portal_access and r.valid_during @> p_on
  ), joined as (
    select e.class_id from core.enrollments e, school
    where e.tenant_id = app.tenant_id() and e.org_id = school.id and e.status = 'active'
      and e.valid_during @> p_on
      and (e.user_id = p_viewer or (e.role = 'student' and e.user_id in (select student_user_id from children)))
  ), linked as (
    select c.id from core.classes c
    where c.tenant_id = app.tenant_id() and c.status = 'active'
      and (c.id in (select class_id from joined) or c.homeroom_class_id in (select class_id from joined))
    union
    select c.homeroom_class_id from core.classes c
    where c.tenant_id = app.tenant_id() and c.status = 'active' and c.homeroom_class_id is not null
      and c.id in (select class_id from joined)
  )
  select c.id from core.classes c, school
  where c.tenant_id = app.tenant_id() and c.org_id = school.id and c.status = 'active'
    and (p_school_wide or c.id in (select id from linked))
$$;

revoke all on function app.visible_classes(uuid, uuid, date, boolean) from public;
grant execute on function app.visible_classes(uuid, uuid, date, boolean) to app;
