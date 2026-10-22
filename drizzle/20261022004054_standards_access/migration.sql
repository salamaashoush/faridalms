-- What the generated migration cannot express for standards: forced row
-- level security, the grants, the version and dates every row changed in
-- place keeps, and the capability that keeps a school's frameworks, which
-- the roles that run a school gain in every tenant; roles a school made
-- itself keep what the school chose.

alter table core.standard_frameworks force row level security;
alter table core.standards force row level security;

grant select, insert, update on core.standard_frameworks, core.standards to app, worker, cell_io;
grant select on core.standard_frameworks, core.standards to retention;

create trigger row_meta before insert or update on core.standard_frameworks for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.standards for each row execute function app.row_meta();

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles set capabilities = capabilities || array['standards:manage']
    where tenant_id = t and status = 'active' and not ('standards:manage' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal');
  end loop;
end $$;
