-- The exam-board coursework module is gone. Grade scales and programmes
-- stay, so the capability that set them up keeps its holders under the
-- name of what it now covers, and the scans of paper declarations go to the
-- trash, from which the files sweep removes them and their bytes.

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    update core.access_roles
    set capabilities = array_replace(capabilities, 'exams:manage', 'grading:manage')
    where tenant_id = t and 'exams:manage' = any (capabilities);

    update core.files set trashed_at = statement_timestamp()
    where tenant_id = t and host_type = 'attempt_declaration' and status = 'active'
      and trashed_at is null;
  end loop;
end $$;
