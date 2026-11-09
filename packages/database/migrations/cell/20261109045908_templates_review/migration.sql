-- The capability that reviews what teachers share as templates is named
-- for the templates it reviews. Every role that held it, built in or made
-- by a school, holds it under the new name and keeps its place in the list.

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles
    set capabilities = array_replace(capabilities, 'library:review', 'templates:review')
    where tenant_id = t and 'library:review' = any (capabilities);
  end loop;
end $$;
