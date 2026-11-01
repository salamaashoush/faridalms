-- What the generated migration cannot express for medical reports: the key
-- from a family's change to the report it carries, added NOT VALID as every
-- key added to a table that already holds rows here, since checking it
-- would read the table under forced row security without a tenant. The
-- column is new and empty, and every row written is checked.

alter table health.requested_changes
  add constraint requested_changes_tenant_id_file_id_file_purpose_fkey
    foreign key (tenant_id, file_id, file_purpose) references core.files (tenant_id, id, purpose) not valid;
