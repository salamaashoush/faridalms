-- What the generated migration cannot express for a bell schedule's own
-- periods: their key to the schedule, and the year's period exclusions,
-- which now hold the year's own periods only. A schedule's periods span the
-- whole year beside them and are kept apart by their own code key.

-- Validating the key would read the table under forced row security, where
-- a migration has no tenant, so it holds for every row written from here on;
-- no existing period belongs to a schedule.
alter table core.class_periods
  add constraint class_periods_tenant_id_bell_schedule_id_school_year_id_fkey
  foreign key (tenant_id, bell_schedule_id, school_year_id)
  references core.bell_schedules (tenant_id, id, school_year_id)
  not valid;

alter table core.class_periods drop constraint class_periods_code_excl;
alter table core.class_periods drop constraint class_periods_sequence_excl;
alter table core.class_periods add constraint class_periods_code_excl exclude using gist
  (tenant_id with =, org_id with =, school_year_id with =, code with =, valid_during with &&)
  where (status = 'active' and bell_schedule_id is null);
alter table core.class_periods add constraint class_periods_sequence_excl exclude using gist
  (tenant_id with =, org_id with =, school_year_id with =, sequence with =, valid_during with &&)
  where (status = 'active' and bell_schedule_id is null);
