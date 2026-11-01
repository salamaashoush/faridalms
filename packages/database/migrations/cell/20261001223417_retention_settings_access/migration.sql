-- What the generated migration cannot express for retention settings:
-- the row trigger, forced row level security and the grants.

create trigger row_meta before insert or update on core.retention_settings for each row execute function app.row_meta();

alter table core.retention_settings force row level security;

grant select, insert, update on core.retention_settings to app, worker, cell_io;
grant select on core.retention_settings to retention;

-- Administrators gain the new capability in every tenant; roles a school
-- made itself keep what the school chose, so a data protection officer's
-- role is granted it deliberately.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles set capabilities = capabilities || array['privacy:manage']
    where tenant_id = t and status = 'active' and not ('privacy:manage' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal');
  end loop;
end $$;
