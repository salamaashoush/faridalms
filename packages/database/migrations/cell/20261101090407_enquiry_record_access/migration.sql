-- What the generated migration cannot express for the enquiry record: the
-- thread's forced row level security and grants, the keys from enquiries to
-- the people they name, the move from handled to the enquiry's states, the
-- notification kind that tells staff one arrived, and the admissions
-- capabilities with the role that carries them.

alter table core.site_enquiry_entries force row level security;

grant select, insert on core.site_enquiry_entries to app, worker, cell_io;
grant select on core.site_enquiry_entries to retention;

-- The site role counts a flood from the website's own enquiries only, so it
-- may also read where each came from.
grant select (source) on core.site_enquiries to site;

-- Not valid, as every key added to an existing table here: checking the rows
-- already there would read them under forced row security without a tenant.
-- The columns are new and empty, and every row written from now is checked.
alter table core.site_enquiries
  add constraint site_enquiries_tenant_id_assignee_user_id_fkey
    foreign key (tenant_id, assignee_user_id) references core.users (tenant_id, id) not valid,
  add constraint site_enquiries_tenant_id_created_by_user_id_fkey
    foreign key (tenant_id, created_by_user_id) references core.users (tenant_id, id) not valid,
  add constraint site_enquiries_tenant_id_family_user_id_fkey
    foreign key (tenant_id, family_user_id) references core.users (tenant_id, id) not valid,
  add constraint site_enquiries_tenant_id_applicant_user_id_fkey
    foreign key (tenant_id, applicant_user_id) references core.users (tenant_id, id) not valid;

alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent', 'mention', 'library', 'reply', 'enquiry'));

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    -- An enquiry marked dealt with was answered and needed nothing more, so
    -- it is closed for that reason from the moment it was marked. Nobody
    -- recorded when it was first answered, so its response time stays unknown.
    update core.site_enquiries
    set state = 'closed', closed_reason = 'answered', state_changed_at = handled_at
    where tenant_id = t and handled_at is not null;

    -- Whoever could read and mark enquiries in the website screen keeps
    -- doing so in the inbox: the roles that run a school, and any role a
    -- school made that manages its website. Other custom roles keep what the
    -- school chose.
    update core.access_roles
    set capabilities = capabilities || array['admissions:read', 'admissions:manage']
    where tenant_id = t and status = 'active'
      and not ('admissions:manage' = any (capabilities))
      and (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal')
        or 'site:manage' = any (capabilities));

    insert into core.access_roles (tenant_id, builtin_key, name_en, name_ar, capabilities)
    select t, 'admissions_officer', 'Admissions officer', 'مسؤول القبول',
      array['assignments:read', 'messages:read', 'messages:send', 'calendar:read', 'timetable:read',
        'admissions:read', 'admissions:manage']
    where not exists (
      select 1 from core.access_roles
      where tenant_id = t and builtin_key = 'admissions_officer' and org_id is null and status = 'active');
  end loop;
end $$;
