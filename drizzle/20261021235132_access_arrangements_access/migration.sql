-- What the generated migration cannot express for access arrangements:
-- forced row level security, the grants, the version and dates every row
-- updated in place keeps, the erasure that removes a student's
-- arrangements, and the capability that keeps them, which the roles that
-- run a school and its learning support gain in every tenant; roles a
-- school made itself keep what the school chose.

alter table core.access_arrangements force row level security;

grant select, insert, update on core.access_arrangements to app, worker, cell_io;
grant select on core.access_arrangements to retention;
grant update (status, metadata) on core.access_arrangements to retention;
grant delete on core.access_arrangements to retention;

create trigger row_meta before insert or update on core.access_arrangements for each row execute function app.row_meta();

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles set capabilities = capabilities || array['support:manage']
    where tenant_id = t and status = 'active' and not ('support:manage' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal',
        'counselor');
  end loop;
end $$;
