-- A delivery may also be a sign-in link emailed to a person: an invitation
-- to choose a password, or a reset. The link goes at once, inside the
-- request, so its row records what happened rather than what to send. It
-- names the school that sent it; the link's secret is never kept here.
alter table core.notification_deliveries
  add column link_purpose text,
  add column org_id uuid;
alter table core.notification_deliveries
  drop constraint notification_deliveries_recipient_check;
alter table core.notification_deliveries
  add constraint notification_deliveries_recipient_check check (
    (user_id is not null and notification_id is not null and notification_created_at is not null
      and contact_id is null and message_id is null and link_purpose is null and org_id is null)
    or (user_id is null and notification_id is null and notification_created_at is null
      and contact_id is not null and message_id is not null and link_purpose is null and org_id is null)
    or (user_id is not null and link_purpose is not null and org_id is not null
      and notification_id is null and notification_created_at is null
      and contact_id is null and message_id is null)),
  add constraint notification_deliveries_link_purpose_check check (link_purpose in ('invite', 'reset')),
  add constraint notification_deliveries_link_state_check check (link_purpose is null or state in ('sent', 'failed')),
  add constraint notification_deliveries_tenant_id_org_id_fkey
    foreign key (tenant_id, org_id) references core.orgs (tenant_id, id);
