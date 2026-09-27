-- What the generated migration cannot express for attendance: a register's
-- day inside its school year, the events table partitioned by year, row
-- triggers, forced row level security, grants, the year-span guard over
-- registers, and the attendance descriptors and office capability for
-- tenants provisioned before this catalogue had them.

alter table core.attendance_registers add foreign key (tenant_id, school_year_id, school_year_type, period span)
references core.academic_sessions (tenant_id, id, type, period span);

create table core.attendance_events (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  taken_on date not null,
  register_id uuid not null,
  student_user_id uuid not null,
  category_descriptor_id uuid not null,
  category_ns text not null default 'attendance_category',
  category_meaning text not null,
  reason_descriptor_id uuid,
  reason_ns text not null default 'attendance_reason',
  minutes smallint,
  note text,
  recorded_by_user_id uuid not null,
  status text not null default 'active',
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, taken_on, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, register_id, taken_on) references core.attendance_registers (tenant_id, id, taken_on),
  foreign key (tenant_id, student_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, recorded_by_user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, category_descriptor_id, category_ns, category_meaning)
    references core.descriptors (tenant_id, id, namespace, system_meaning),
  foreign key (tenant_id, reason_descriptor_id, reason_ns) references core.descriptors (tenant_id, id, namespace),
  constraint attendance_events_category_ns_check check (category_ns = 'attendance_category'),
  constraint attendance_events_category_meaning_check
    check (category_meaning in ('present', 'absent', 'late', 'excused', 'left_early')),
  constraint attendance_events_reason_ns_check check (reason_ns = 'attendance_reason'),
  constraint attendance_events_minutes_check check (minutes between 1 and 600),
  constraint attendance_events_minutes_timed_check
    check (minutes is null or category_meaning in ('late', 'left_early')),
  constraint attendance_events_note_check check (char_length(note) between 1 and 500),
  constraint attendance_events_status_check check (status in ('active', 'tobedeleted')),
  constraint attendance_events_version_check check (version > 0),
  constraint attendance_events_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
) partition by range (taken_on);
create unique index attendance_events_key on core.attendance_events (tenant_id, taken_on, register_id, student_user_id)
  where status = 'active';
create index attendance_events_student_idx on core.attendance_events (tenant_id, student_user_id, taken_on)
  where status = 'active';
create index attendance_events_unexplained_idx on core.attendance_events (tenant_id, taken_on)
  where status = 'active' and reason_descriptor_id is null and category_meaning in ('absent', 'late');

alter table core.attendance_events enable row level security;
create policy tenant_isolation on core.attendance_events as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.attendance_events for all to cell_owner using (true) with check (true);
create policy p_select on core.attendance_events for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.attendance_events for insert to app, worker, cell_io with check (true);
create policy p_update on core.attendance_events for update to app, worker, cell_io using (true) with check (true);

create trigger row_meta before insert or update on core.attendance_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attendance_registers for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attendance_events for each row execute function app.row_meta();

alter table core.attendance_settings force row level security;
alter table core.attendance_registers force row level security;
alter table core.attendance_events force row level security;

grant select, insert, update on core.attendance_settings, core.attendance_registers, core.attendance_events
  to app, worker, cell_io;
grant select on core.attendance_settings, core.attendance_registers, core.attendance_events to retention;

-- Partition bounds are UTC midnights; a date key reads them in the session's zone.
set local timezone = 'UTC';
insert into ops.partitioned_tables (schema_name, table_name, period) values ('core', 'attendance_events', 'year');
select app.ensure_partitions(12);

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
               and g.school_year_id = y.id and not p_span @> g.taken_on) then
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
  delete from core.academic_sessions s
  where s.tenant_id = y.tenant_id and s.school_year_id = y.id and s.id <> y.id and s.status = 'tobedeleted'
    and not p_span @> s.span;
  update core.academic_sessions set span = p_span where tenant_id = y.tenant_id and id = y.id;
  insert into audit.log (tenant_id, action, object_type, object_id, org_id, details)
  values (y.tenant_id, 'academic_session.span_change', 'academic_session', y.id, y.org_id,
          jsonb_build_object('from', y.span::text, 'to', p_span::text, 'removed_calendar_dates', removed));
  return removed;
end $$;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    insert into core.descriptors
      (tenant_id, namespace, code_value, label_en, label_ar, system_meaning, sort_order, edfi_uri, seeded)
    values
      (t, 'attendance_category', 'present', 'Present', 'حاضر', 'present', 0, 'uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance', true),
      (t, 'attendance_category', 'absent', 'Absent', 'غائب', 'absent', 1, 'uri://ed-fi.org/AttendanceEventCategoryDescriptor#Unexcused Absence', true),
      (t, 'attendance_category', 'late', 'Late', 'متأخر', 'late', 2, 'uri://ed-fi.org/AttendanceEventCategoryDescriptor#Tardy', true),
      (t, 'attendance_category', 'excused', 'Excused absence', 'غياب بعذر', 'excused', 3, 'uri://ed-fi.org/AttendanceEventCategoryDescriptor#Excused Absence', true),
      (t, 'attendance_category', 'left_early', 'Left early', 'انصرف مبكرًا', 'left_early', 4, 'uri://ed-fi.org/AttendanceEventCategoryDescriptor#Early departure', true),
      (t, 'attendance_reason', 'illness', 'Illness', 'مرض', 'illness', 0, null, true),
      (t, 'attendance_reason', 'medical', 'Medical appointment', 'موعد طبي', 'medical', 1, null, true),
      (t, 'attendance_reason', 'family', 'Family matter', 'ظرف عائلي', 'family', 2, null, true),
      (t, 'attendance_reason', 'religious', 'Religious observance', 'مناسبة دينية', 'religious', 3, null, true),
      (t, 'attendance_reason', 'transport', 'Transport', 'المواصلات', 'transport', 4, null, true),
      (t, 'attendance_reason', 'school_activity', 'School activity', 'نشاط مدرسي', 'school_activity', 5, null, true),
      (t, 'attendance_reason', 'other', 'Other', 'أخرى', 'other', 6, null, true)
    on conflict do nothing;
    update core.access_roles set capabilities = capabilities || array['attendance:manage']
    where tenant_id = t and status = 'active' and not ('attendance:manage' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal');
  end loop;
end $$;
