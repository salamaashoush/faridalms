-- The capability that reviews what teachers share to the school library,
-- which the roles that run a school gain in every tenant; roles a school
-- made itself keep what the school chose. Pieces kept before the library
-- had reviews were already offered to the whole school, so they stay shared.

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles set capabilities = capabilities || array['library:review']
    where tenant_id = t and status = 'active' and not ('library:review' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal');
  end loop;
end $$;
