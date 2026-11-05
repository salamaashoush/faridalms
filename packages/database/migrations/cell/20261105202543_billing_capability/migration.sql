-- A school's administrators read its invoices and pay them: every tenant's
-- built-in administrator roles take the capability its Billing page needs.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles
    set capabilities = capabilities || array['billing:read']
    where tenant_id = t and status = 'active'
      and not ('billing:read' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal');
  end loop;
end $$;
