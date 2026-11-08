-- A team searches its own internal entries: notes, logged calls, meetings
-- and emails, and held mail. Each is indexed under the result type
-- `team_thread`, which search offers only among the conversations of the
-- mailboxes the viewer reads, so a family that finds its conversation by a
-- word is still never shown a staff note: its own conversations are found
-- as `message_thread`, from messages alone. A recorded change stays out.
create or replace function app.index_message() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.kind = 'event' or new.redacted_at is not null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'message' and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, text_vector)
  values (new.tenant_id, 'message', new.id,
          case when new.kind = 'message' then 'message_thread' else 'team_thread' end, new.thread_id,
          to_tsvector('arabic'::regconfig, left(new.body, 200000))
          || to_tsvector('english'::regconfig, left(new.body, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, result_type = excluded.result_type;
  return new;
end $$;
revoke all on function app.index_message() from public;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, text_vector)
    select x.tenant_id, 'message', x.id, 'team_thread', x.thread_id,
      to_tsvector('arabic'::regconfig, left(x.body, 200000))
      || to_tsvector('english'::regconfig, left(x.body, 200000))
    from core.messages x
    where x.tenant_id = t and x.status = 'active' and x.redacted_at is null
      and x.kind not in ('message', 'event') and x.body <> ''
    on conflict (tenant_id, entity_type, entity_id) do nothing;
  end loop;
end $$;
