-- A family's registration link, and the note to one already registered,
-- go in the delivery log beside invitations and resets.
alter table core.notification_deliveries drop constraint notification_deliveries_link_purpose_check;
alter table core.notification_deliveries
  add constraint notification_deliveries_link_purpose_check check (link_purpose in ('invite', 'reset', 'register'));
