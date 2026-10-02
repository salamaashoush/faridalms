-- Teachers print their class's sign-in badges, so the teaching roles gain the
-- new capability alongside the administrators in every tenant; roles a school
-- made itself keep what the school chose.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles set capabilities = capabilities || array['badges:issue']
    where tenant_id = t and status = 'active' and not ('badges:issue' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal',
        'teacher', 'counselor');
  end loop;
end $$;
