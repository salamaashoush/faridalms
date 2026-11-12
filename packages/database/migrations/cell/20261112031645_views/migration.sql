create view core.current_consents with (security_invoker = true) as
select distinct on (tenant_id, subject_user_id, purpose_descriptor_id) *
from core.consent_records
order by tenant_id, subject_user_id, purpose_descriptor_id, created_at desc, id desc;

-- This function takes a relationship row, so it is created once the tables
-- exist rather than with the other functions.
-- Every purpose needs a current link. Following the child and contacting
-- the family in the portal need portal access; the school's notices need a
-- link that takes them; contact, notices, calls and the medical summary need
-- the school not to have cut the guardian off; deciding for the child,
-- consenting and the medical summary need rights over the child no court
-- order has limited, and consenting and the medical summary a legal
-- guardian the office confirmed. A purpose this
-- does not know is an error rather than a silent refusal, so a caller's
-- typo cannot pass as policy.
create function app.guardian_permits(r core.user_relationships, p_on date, p_purpose text)
returns boolean
language plpgsql stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_purpose is null
    or p_purpose not in ('follow', 'contact', 'notice', 'call', 'health', 'consent', 'decide') then
    raise exception 'unknown guardian purpose %', p_purpose using errcode = '22023';
  end if;
  return r.status = 'active' and r.valid_during @> p_on
    and (p_purpose not in ('follow', 'contact', 'health') or r.portal_access)
    and (p_purpose <> 'notice' or r.receives_notifications)
    and (p_purpose in ('follow', 'consent', 'decide') or not r.communication_isolated)
    and (p_purpose not in ('health', 'consent', 'decide') or r.educational_rights = 'full')
    and (p_purpose not in ('health', 'consent')
      or (coalesce(r.legal_guardian, false) and r.verified_at is not null));
end
$$;
revoke all on function app.guardian_permits(core.user_relationships, date, text) from public;
grant execute on function app.guardian_permits(core.user_relationships, date, text) to app, worker;
