-- A tenant and its root org are written in one transaction, each naming the
-- other.
alter table core.tenants add foreign key (tenant_id, root_org_id)
  references core.orgs (tenant_id, id) deferrable initially deferred;

create unique index descriptors_code_key on core.descriptors (tenant_id, namespace, org_id, code_value)
  nulls not distinct where status = 'active';

create unique index access_roles_builtin_key on core.access_roles (tenant_id, org_id, builtin_key)
  nulls not distinct where status = 'active' and builtin_key is not null;

-- A school's own reference for a student is unique on a key of its own, so a
-- reference already in use is reported as that rather than as a taken
-- document number.
create unique index external_ids_identifier_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier) nulls not distinct
  where status = 'active' and identifier is not null and system_meaning <> 'school_reference';
create unique index external_ids_reference_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier) nulls not distinct
  where status = 'active' and identifier is not null and system_meaning = 'school_reference';
create unique index external_ids_hmac_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier_hmac) nulls not distinct
  where status = 'active' and identifier_hmac is not null;

alter table core.academic_sessions add unique (tenant_id, id, span without overlaps);
alter table core.academic_sessions add unique (tenant_id, id, type, span without overlaps);
alter table core.academic_sessions add foreign key (tenant_id, parent_id, parent_type, period span)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.academic_sessions add constraint academic_sessions_year_excl exclude using gist
  (tenant_id with =, org_id with =, span with &&) where (type = 'school_year' and status = 'active');
alter table core.academic_sessions add constraint academic_sessions_sibling_excl exclude using gist
  (tenant_id with =, parent_id with =, type with =, span with &&)
  where (parent_id is not null and status = 'active');

alter table core.academic_weeks add foreign key (tenant_id, school_year_id, school_year_type, period span)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.academic_weeks add constraint academic_weeks_excl exclude using gist
  (tenant_id with =, school_year_id with =, span with &&) where (status = 'active');

-- The school's own periods are kept apart here. A bell schedule's periods are
-- held on every day of their schedule and are kept apart by their own code key.
alter table core.class_periods add constraint class_periods_code_excl exclude using gist
  (tenant_id with =, org_id with =, code with =, valid_during with &&)
  where (status = 'active' and bell_schedule_id is null);
alter table core.class_periods add constraint class_periods_sequence_excl exclude using gist
  (tenant_id with =, org_id with =, sequence with =, valid_during with &&)
  where (status = 'active' and bell_schedule_id is null);

alter table core.student_school_years
  add foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.student_school_years add constraint student_school_years_excl exclude using gist
  (tenant_id with =, student_user_id with =, org_id with =, valid_during with &&)
  where (status = 'active');

alter table core.student_grades add constraint student_grades_excl exclude using gist
  (tenant_id with =, student_user_id with =, org_id with =, valid_during with &&)
  where (status = 'active');

alter table core.user_roles add constraint user_roles_role_excl exclude using gist
  (tenant_id with =, user_id with =, org_id with =, role with =, valid_during with &&)
  where (status = 'active');

alter table core.user_relationships add constraint user_relationships_excl exclude using gist
  (tenant_id with =, student_user_id with =, related_user_id with =, valid_during with &&)
  where (status = 'active');

alter table core.access_role_assignments add constraint access_role_assignments_excl exclude using gist
  (tenant_id with =, user_id with =, access_role_id with =, org_id with =, valid_during with &&)
  where (status = 'active');

-- A class's code is its own among the school's classes that run at the same
-- time, so a class carried into the next year keeps it.
alter table core.classes add unique (tenant_id, id, runs without overlaps);
alter table core.classes add constraint classes_code_excl exclude using gist
  (tenant_id with =, org_id with =, code with =, runs with &&) where (status = 'active');

-- An active enrollment lies inside the days its class runs. A tombstoned one
-- has no active_class_id and keeps whatever days it had.
alter table core.enrollments
  add foreign key (tenant_id, active_class_id, period valid_during)
  references core.classes (tenant_id, id, period runs);
alter table core.enrollments add constraint enrollments_excl exclude using gist
  (tenant_id with =, class_id with =, user_id with =, role with =, valid_during with &&)
  where (status = 'active');

-- A student holds one place in a homeroom at a time.
alter table core.homeroom_members add constraint homeroom_members_excl exclude using gist
  (tenant_id with =, org_id with =, student_user_id with =, valid_during with &&)
  where (status = 'active');

-- Two timetables of a school never hold the same day, so their meetings may
-- share a class, teacher or room at the same place in their cycles.
alter table core.class_meetings add constraint class_meetings_class_excl exclude using gist
  (tenant_id with =, timetable_id with =, class_id with =, weekday with =, class_period_id with =,
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

-- lz4 compresses a large document several times faster than pglz for about
-- the same size, which each save pays.
alter table core.documents
  alter column content set compression lz4,
  alter column plain_text set compression lz4,
  alter column ydoc set compression lz4;
alter table core.document_versions
  alter column content set compression lz4,
  alter column plain_text set compression lz4,
  alter column ydoc_snapshot set compression lz4;
alter table core.document_translations
  alter column content set compression lz4,
  alter column plain_text set compression lz4;
