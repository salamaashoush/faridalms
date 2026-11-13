create view core.current_consents with (security_invoker = true) as
select distinct on (tenant_id, subject_user_id, purpose_descriptor_id) *
from core.consent_records
order by tenant_id, subject_user_id, purpose_descriptor_id, created_at desc, id desc;

-- This function takes a relationship row, so it is created once the tables
-- exist rather than with the other functions.
-- Every purpose needs a current link. Following the child and contacting
-- the family in the portal need portal access; the school's notices need a
-- link that takes them; contact, notices, calls and the medical summary need
-- the school not to have cut the guardian off; deciding for the child,
-- consenting and the medical summary need rights over the child no court
-- order has limited, and consenting and the medical summary a legal
-- guardian the office confirmed. A purpose this
-- does not know is an error rather than a silent refusal, so a caller's
-- typo cannot pass as policy.
create function app.guardian_permits(r core.user_relationships, p_on date, p_purpose text)
returns boolean
language plpgsql stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_purpose is null
    or p_purpose not in ('follow', 'contact', 'notice', 'call', 'health', 'consent', 'decide') then
    raise exception 'unknown guardian purpose %', p_purpose using errcode = '22023';
  end if;
  return r.status = 'active' and r.valid_during @> p_on
    and (p_purpose not in ('follow', 'contact', 'health') or r.portal_access)
    and (p_purpose <> 'notice' or r.receives_notifications)
    and (p_purpose in ('follow', 'consent', 'decide') or not r.communication_isolated)
    and (p_purpose not in ('health', 'consent', 'decide') or r.educational_rights = 'full')
    and (p_purpose not in ('health', 'consent')
      or (coalesce(r.legal_guardian, false) and r.verified_at is not null));
end
$$;
revoke all on function app.guardian_permits(core.user_relationships, date, text) from public;
grant execute on function app.guardian_permits(core.user_relationships, date, text) to app, worker;

-- What a visitor to a school's website reads of the classes it shows, and
-- nothing else of them: the words the school wrote for the site, the days
-- the class runs and its teachers' names, for a class still running or yet
-- to start. The site role reads neither classes nor people, so this reads
-- them for it, and is created once the tables exist.
create function app.site_classes(p_org uuid, p_today date)
returns table (class_id uuid, title_en text, title_ar text, description_en text, description_ar text,
  level_en text, level_ar text, picture_key text, picture jsonb, picture_alt_en text,
  picture_alt_ar text, starts_on date, ends_on date, course_id uuid, teachers_en text[],
  teachers_ar text[])
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select c.id,
    coalesce(nullif(s.title_en, ''), c.title_en, c.title_ar),
    coalesce(nullif(s.title_ar, ''), c.title_ar, c.title_en),
    s.description_en, s.description_ar, s.level_en, s.level_ar,
    s.picture_key, s.picture, s.picture_alt_en, s.picture_alt_ar,
    lower(c.runs), case when upper_inf(c.runs) then null else upper(c.runs) - 1 end,
    c.course_id, coalesce(t.en, '{}'), coalesce(t.ar, '{}')
  from core.site_classes s
  join core.classes c on c.tenant_id = s.tenant_id and c.id = s.class_id and c.org_id = s.org_id
    and c.status = 'active'
  left join lateral (
    select array_agg(coalesce(u.full_name_en, u.full_name_ar) order by e.is_primary desc, u.full_name_en) as en,
      array_agg(coalesce(u.full_name_ar, u.full_name_en) order by e.is_primary desc, u.full_name_en) as ar
    from core.enrollments e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id and u.status = 'active'
    where e.tenant_id = c.tenant_id and e.class_id = c.id and e.role = 'teacher'
      and e.status = 'active' and e.valid_during @> greatest(lower(c.runs), p_today)
  ) t on true
  where s.org_id = p_org and s.status = 'active' and s.shown
    and (upper_inf(c.runs) or upper(c.runs) > p_today)
  order by lower(c.runs), c.id
  limit 200
$$;
revoke all on function app.site_classes(uuid, date) from public;
grant execute on function app.site_classes(uuid, date) to app, site;
