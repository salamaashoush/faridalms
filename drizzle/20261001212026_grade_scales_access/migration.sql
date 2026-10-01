-- What the generated migration cannot express for grade scales and
-- programmes: the row triggers, forced row level security, the grants, and
-- the function that finds the bands a class grades on.

create trigger row_meta before insert or update on core.grade_scales for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.grade_scale_versions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.programmes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.programme_grade_levels for each row execute function app.row_meta();

alter table core.grade_scales force row level security;
alter table core.grade_scale_versions force row level security;
alter table core.programmes force row level security;
alter table core.programme_grade_levels force row level security;

grant select, insert, update on core.grade_scales, core.programmes, core.programme_grade_levels to app, worker, cell_io;
-- A version is never changed once written: the grades given under it keep
-- reading the same, and new bands are a new version.
grant select, insert on core.grade_scale_versions to app, worker, cell_io;
grant select on core.grade_scales, core.grade_scale_versions, core.programmes, core.programme_grade_levels to retention;

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

revoke all on function app.programme_of(uuid), app.scale_version_of(uuid, date) from public;
grant execute on function app.programme_of(uuid), app.scale_version_of(uuid, date) to app, worker, cell_io, retention;
