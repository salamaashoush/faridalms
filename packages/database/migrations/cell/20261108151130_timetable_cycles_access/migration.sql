-- What the generated migration cannot express for timetables and bell
-- schedules: the row triggers, forced row level security, the grants, the
-- keys from existing tables, the meeting exclusions taking each meeting's
-- timetable into account, and the first timetable of every year, which
-- keeps every meeting where it was.

create trigger row_meta before insert or update on core.timetables for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.bell_schedules for each row execute function app.row_meta();

alter table core.timetables force row level security;
alter table core.bell_schedules force row level security;

grant select, insert, update on core.timetables, core.bell_schedules to app, worker, cell_io;
grant select on core.timetables, core.bell_schedules to retention;

-- Validating these keys would read the tables under forced row security,
-- where a migration has no tenant, so they hold for every row written from
-- here on; the backfill below writes every existing meeting's.
alter table core.calendar_dates
  add constraint calendar_dates_tenant_id_bell_schedule_id_school_year_id_fkey
  foreign key (tenant_id, bell_schedule_id, school_year_id)
  references core.bell_schedules (tenant_id, id, school_year_id)
  not valid;
alter table core.class_meetings
  add constraint class_meetings_tenant_id_timetable_id_school_year_id_org_i_fkey
  foreign key (tenant_id, timetable_id, school_year_id, org_id)
  references core.timetables (tenant_id, id, school_year_id, org_id)
  not valid;

-- Two timetables of a year never hold the same day, so their meetings may
-- share a class, teacher or room at the same place in their cycles.
alter table core.class_meetings drop constraint class_meetings_class_excl;
alter table core.class_meetings drop constraint class_meetings_group_excl;
alter table core.class_meetings drop constraint class_meetings_teacher_excl;
alter table core.class_meetings drop constraint class_meetings_room_excl;
alter table core.class_meetings add constraint class_meetings_class_excl exclude using gist
  (tenant_id with =, timetable_id with =, class_id with =, weekday with =, class_period_id with =,
   valid_during with &&)
  where (status = 'active');
alter table core.class_meetings add constraint class_meetings_group_excl exclude using gist
  (tenant_id with =, timetable_id with =, group_class_id with =, weekday with =, class_period_id with =,
   valid_during with &&)
  where (status = 'active');
alter table core.class_meetings add constraint class_meetings_teacher_excl exclude using gist
  (tenant_id with =, timetable_id with =, teacher_user_id with =, weekday with =, class_period_id with =,
   valid_during with &&)
  where (status = 'active' and not clash_accepted and teacher_user_id is not null);
alter table core.class_meetings add constraint class_meetings_room_excl exclude using gist
  (tenant_id with =, timetable_id with =, location_id with =, weekday with =, class_period_id with =,
   valid_during with &&)
  where (status = 'active' and not clash_accepted and location_id is not null);
--> statement-breakpoint
-- Every year so far ran one ordinary week, so each gets that as its first
-- timetable from its first day, and its meetings belong to it: each meeting
-- keeps its weekday as the day of a one-week cycle, which is the same day.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    INSERT INTO core.timetables (tenant_id, org_id, school_year_id, starts_on, cycle_kind,
      cycle_length, first_day, closures_move, status)
    SELECT y.tenant_id, y.org_id, y.id, lower(y.span), 'weeks', 1, 1, false, y.status
    FROM core.academic_sessions y
    WHERE y.tenant_id = t AND y.type = 'school_year'
      AND NOT EXISTS (SELECT 1 FROM core.timetables x
        WHERE x.tenant_id = y.tenant_id AND x.school_year_id = y.id);

    UPDATE core.class_meetings m
    SET timetable_id = x.id
    FROM core.timetables x
    WHERE m.tenant_id = t AND x.tenant_id = t AND x.school_year_id = m.school_year_id
      AND m.timetable_id IS NULL;
  END LOOP;
END $$;
