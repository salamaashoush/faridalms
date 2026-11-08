-- A merged contact names the one it was merged into. The key is added NOT
-- VALID, as every key added to a table that already holds rows here:
-- checking it would read the table under forced row security without a
-- tenant. The column is new and empty, and every row written is checked.
alter table core.message_contacts
  add constraint message_contacts_tenant_id_merged_into_id_fkey
    foreign key (tenant_id, merged_into_id) references core.message_contacts (tenant_id, id) not valid;

-- Mail sent to a contact before it was merged keeps naming it, so erasing
-- the contact it was merged into empties those addresses too.
drop policy p_erase_update on core.notification_deliveries;
create policy p_erase_update on core.notification_deliveries for update to retention
  using (app.erasure_approved(tenant_id, contact_id)
    or exists (select 1 from core.message_contacts c where c.tenant_id = notification_deliveries.tenant_id
      and c.id = notification_deliveries.contact_id
      and (app.erasure_approved(c.tenant_id, c.user_id)
        or app.erasure_approved(c.tenant_id, c.merged_into_id))))
  with check (address is null);
