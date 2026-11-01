-- A school's own reference for a student is unique on a key of its own, so a
-- reference already in use is reported as that rather than as a taken
-- document number.
drop index core.external_ids_identifier_key;
create unique index external_ids_identifier_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier) nulls not distinct
  where status = 'active' and identifier is not null and system_meaning <> 'school_reference';
create unique index external_ids_reference_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier) nulls not distinct
  where status = 'active' and identifier is not null and system_meaning = 'school_reference';
