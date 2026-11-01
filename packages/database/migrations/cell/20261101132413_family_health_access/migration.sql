-- What the generated migration cannot express for a family's medical
-- summary: the forced row level security, trigger and grants of the changes
-- families ask for, what erasure may remove, the one rule for which of a
-- child's guardians a purpose reaches, the notification kind that answers a
-- family's change, and the doctor as a health kind for the schools made
-- before it.

alter table health.requested_changes force row level security;

create trigger row_meta before insert or update on health.requested_changes
  for each row execute function app.row_meta();

grant select, insert, update on health.requested_changes to app, worker, cell_io;
grant select on health.requested_changes to retention;
grant update (status, metadata) on health.requested_changes to retention;
grant delete on health.requested_changes to retention;

-- Whether a guardian's link lets the school do something for the child
-- today. Every purpose needs a current link with portal access; contact also
-- needs the school not to have cut the guardian off; the medical summary also
-- needs a legal guardian the office confirmed, whose rights over the child no
-- court order has limited. A purpose this does not know is an error rather
-- than a silent refusal, so a caller's typo cannot pass as policy.
create function app.guardian_permits(r core.user_relationships, p_on date, p_purpose text)
returns boolean
language plpgsql stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_purpose is null or p_purpose not in ('follow', 'contact', 'health') then
    raise exception 'unknown guardian purpose %', p_purpose using errcode = '22023';
  end if;
  return r.status = 'active' and r.portal_access and r.valid_during @> p_on
    and (p_purpose = 'follow' or not r.communication_isolated)
    and (p_purpose <> 'health' or (coalesce(r.legal_guardian, false) and r.verified_at is not null
      and r.educational_rights = 'full'));
end
$$;

revoke all on function app.guardian_permits(core.user_relationships, date, text) from public;
grant execute on function app.guardian_permits(core.user_relationships, date, text) to app;

alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent',
    'mention', 'library', 'reply', 'enquiry', 'application', 'correction'));

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    insert into core.descriptors (tenant_id, namespace, code_value, label_en, label_ar,
      system_meaning, sort_order, seeded)
    select t, 'health_record_kind', 'doctor', 'Doctor', 'الطبيب المعالج', 'doctor', 5, true
    where not exists (
      select 1 from core.descriptors d
      where d.tenant_id = t and d.namespace = 'health_record_kind' and d.code_value = 'doctor');
  end loop;
end $$;
