-- An event's audience read its description as it was being written; they
-- now read the copy it was published with, which for every event already
-- out is its description as it stands.

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    insert into core.document_versions (tenant_id, document_id, document_version, reason, content,
      plain_text, created_by_user_id)
    select d.tenant_id, d.id, d.version, 'publish', d.content, d.plain_text, e.author_user_id
    from core.documents d
    join core.calendar_events e on e.tenant_id = d.tenant_id and e.id = d.host_id
    where d.tenant_id = t and d.host_type = 'calendar_event' and d.status = 'active'
      and e.state = 'published'
    on conflict do nothing;
  end loop;
end $$;
