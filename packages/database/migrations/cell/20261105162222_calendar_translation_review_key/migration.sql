-- Who checked an event's translation is one of the tenant's people. Validating
-- the key would read the events under forced row security, where a migration
-- has no tenant, so it holds for every row written from here on.
alter table core.calendar_events
  add constraint calendar_events_tenant_id_translation_reviewed_by_user_id_fkey
  foreign key (tenant_id, translation_reviewed_by_user_id) references core.users (tenant_id, id)
  not valid;
