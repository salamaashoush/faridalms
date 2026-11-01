-- What the generated migration cannot express for exam boards and sessions:
-- the row triggers, forced row level security and the grants.

create trigger row_meta before insert or update on core.exam_boards for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.exam_sessions for each row execute function app.row_meta();

alter table core.exam_boards force row level security;
alter table core.exam_sessions force row level security;

grant select, insert, update on core.exam_boards, core.exam_sessions to app, worker, cell_io;
grant select on core.exam_boards, core.exam_sessions to retention;

-- Administrators gain the new capability in every tenant; roles a school
-- made itself keep what the school chose, so an exams officer role is
-- granted it deliberately.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.access_roles set capabilities = capabilities || array['exams:manage']
    where tenant_id = t and status = 'active' and not ('exams:manage' = any (capabilities))
      and builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal');
  end loop;
end $$;
