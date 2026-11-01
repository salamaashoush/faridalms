-- One reach model. Which of a child's guardians the school may do something
-- for is decided by app.guardian_permits alone, which now also knows the
-- school's notices and its phone calls; staff are the holders of the roles
-- app.staff_roles names; and app.reached_people says how far a viewer reaches
-- a person: their whole record, or the limited profile a family or a student
-- opens for the teachers of their classes and the people they are in a
-- conversation with. Search applies that reach before it ranks and limits.

-- Every purpose needs a current link. Following the child and contacting
-- the family in the portal need portal access; the school's notices need a
-- link that takes them; contact, notices and calls need the school not to
-- have cut the guardian off; the medical summary also needs a legal guardian
-- the office confirmed, whose rights over the child no court order has
-- limited. A purpose this does not know is an error rather than a silent
-- refusal, so a caller's typo cannot pass as policy.
create or replace function app.guardian_permits(r core.user_relationships, p_on date, p_purpose text)
returns boolean
language plpgsql stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_purpose is null or p_purpose not in ('follow', 'contact', 'notice', 'call', 'health') then
    raise exception 'unknown guardian purpose %', p_purpose using errcode = '22023';
  end if;
  return r.status = 'active' and r.valid_during @> p_on
    and (p_purpose not in ('follow', 'contact', 'health') or r.portal_access)
    and (p_purpose <> 'notice' or r.receives_notifications)
    and (p_purpose = 'follow' or not r.communication_isolated)
    and (p_purpose <> 'health' or (coalesce(r.legal_guardian, false) and r.verified_at is not null
      and r.educational_rights = 'full'));
end
$$;

grant execute on function app.guardian_permits(core.user_relationships, date, text) to worker;

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

create or replace function app.visible_classes(p_viewer uuid, p_school uuid, p_on date, p_school_wide boolean)
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
  )
  select f.user_id, true from full_reach f
  union
  select p.user_id, false from (select user_id from teaching union select user_id from shared) p
  join core.users u on u.tenant_id = app.tenant_id() and u.id = p.user_id and u.status = 'active'
  where p.user_id not in (select user_id from full_reach)
$$;

revoke all on function app.reached_people(uuid, uuid, date, boolean) from public;
grant execute on function app.reached_people(uuid, uuid, date, boolean) to app;

-- The ids the viewer reaches of the kinds searched are given with the
-- query, so a narrow viewer's hits are ranked and limited among their own
-- rather than lost behind the school's.
drop function app.search(text, text[], uuid[], real, uuid, integer, uuid);

create function app.search(q text, types text[], org_scope uuid[] default null,
  after_rank real default null, after_id uuid default null, max_rows integer default 50,
  prefer_year uuid default null, within uuid[] default null)
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
           (max(h.rank) + case when prefer_year is not null and h.result_type = 'class'
              and exists (select 1 from core.classes c
                          where c.tenant_id = app.tenant_id() and c.id = h.result_id
                            and c.school_year_id = prefer_year)
              then 1 else 0 end)::real as rank
    from hits h group by h.result_type, h.result_id
  )
  select b.result_type, b.result_id, b.rank from best b
  where after_rank is null or (b.rank, b.result_id) < (after_rank, after_id)
  order by b.rank desc, b.result_id desc
  limit least(max_rows, 200)
$$;

revoke all on function app.search(text, text[], uuid[], real, uuid, integer, uuid, uuid[]) from public;
grant execute on function app.search(text, text[], uuid[], real, uuid, integer, uuid, uuid[]) to app, worker;
