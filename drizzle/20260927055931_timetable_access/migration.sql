-- What the generated migration cannot express for the timetable: a
-- meeting's dates inside its school year, the exclusions that keep a class,
-- its homeroom's students, a teacher and a room from being in two places at
-- once (unless someone chose to keep a clash), row triggers, forced row level
-- security, grants, and the year-span guard over meetings.

alter table core.class_meetings add foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
references core.academic_sessions (tenant_id, id, type, period span);
alter table core.class_meetings add constraint class_meetings_class_excl exclude using gist
  (tenant_id with =, class_id with =, weekday with =, class_period_id with =, valid_during with &&)
  where (status = 'active');
alter table core.class_meetings add constraint class_meetings_group_excl exclude using gist
  (tenant_id with =, group_class_id with =, weekday with =, class_period_id with =, valid_during with &&)
  where (status = 'active');
alter table core.class_meetings add constraint class_meetings_teacher_excl exclude using gist
  (tenant_id with =, teacher_user_id with =, weekday with =, class_period_id with =, valid_during with &&)
  where (status = 'active' and not clash_accepted and teacher_user_id is not null);
alter table core.class_meetings add constraint class_meetings_room_excl exclude using gist
  (tenant_id with =, location_id with =, weekday with =, class_period_id with =, valid_during with &&)
  where (status = 'active' and not clash_accepted and location_id is not null);

create trigger row_meta before insert or update on core.class_meetings for each row execute function app.row_meta();

alter table core.class_meetings force row level security;

grant select, insert, update on core.class_meetings to app, worker, cell_io;
grant select on core.class_meetings to retention;

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
