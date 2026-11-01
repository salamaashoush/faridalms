-- Every host system's title, and every message's words, in the search index.
-- A host's title is an entry with the host as its result, so a lesson or an
-- event is found by its name as well as by the document it carries; a
-- message is found by its words and answers with its conversation.

create function app.index_host() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  r jsonb := to_jsonb(new);
  kind text := tg_argv[0];
  names text;
begin
  select nullif(trim(string_agg(r->>tg_argv[i], ' ')), '') into names
  from generate_series(1, tg_nargs - 1) as i;
  if r->>'status' <> 'active' or names is null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = kind and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, name_norm)
  values (new.tenant_id, kind, new.id, kind, new.id,
          case when r->>'org_id' is null then '{}'::uuid[] else array[(r->>'org_id')::uuid] end,
          app.normalize_name(names))
  on conflict (tenant_id, entity_type, entity_id)
    do update set name_norm = excluded.name_norm, org_ids = excluded.org_ids;
  return new;
end $$;

create function app.index_message() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'message' and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, text_vector)
  values (new.tenant_id, 'message', new.id, 'message_thread', new.thread_id,
          to_tsvector('arabic'::regconfig, left(new.body, 200000))
          || to_tsvector('english'::regconfig, left(new.body, 200000)))
  on conflict (tenant_id, entity_type, entity_id) do update set text_vector = excluded.text_vector;
  return new;
end $$;

revoke all on function app.index_host(), app.index_message() from public;

create trigger index_host after insert or update of title_ar, title_en, code, status, org_id on core.classes
  for each row execute function app.index_host('class', 'title_ar', 'title_en', 'code');
create trigger index_host after insert or update of title, status, org_id on core.assignments
  for each row execute function app.index_host('assignment', 'title');
create trigger index_host after insert or update of title, status, org_id on core.announcements
  for each row execute function app.index_host('announcement', 'title');
create trigger index_host after insert or update of title, status, org_id on core.newsletters
  for each row execute function app.index_host('newsletter', 'title');
create trigger index_host after insert or update of title, location, status, org_id on core.calendar_events
  for each row execute function app.index_host('calendar_event', 'title', 'location');
create trigger index_host after insert or update of title, status, org_id on core.learning_modules
  for each row execute function app.index_host('learning_module', 'title');
create trigger index_host after insert or update of title, status on core.lessons
  for each row execute function app.index_host('lesson', 'title');
create trigger index_host after insert or update of subject, status, org_id on core.message_threads
  for each row execute function app.index_host('message_thread', 'subject');
create trigger index_message after insert or update of body, status on core.messages
  for each row execute function app.index_message();

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, name_norm)
    select tenant_id, 'class', id, 'class', id, array[org_id],
           app.normalize_name(nullif(trim(concat_ws(' ', title_ar, title_en, code)), ''))
    from core.classes where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'assignment', id, 'assignment', id, array[org_id], app.normalize_name(title)
    from core.assignments where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'announcement', id, 'announcement', id, array[org_id], app.normalize_name(title)
    from core.announcements where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'newsletter', id, 'newsletter', id, array[org_id], app.normalize_name(title)
    from core.newsletters where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'calendar_event', id, 'calendar_event', id, array[org_id],
           app.normalize_name(concat_ws(' ', title, location))
    from core.calendar_events where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'learning_module', id, 'learning_module', id, array[org_id], app.normalize_name(title)
    from core.learning_modules where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'lesson', id, 'lesson', id, '{}'::uuid[], app.normalize_name(title)
    from core.lessons where tenant_id = t and status = 'active'
    union all
    select tenant_id, 'message_thread', id, 'message_thread', id, array[org_id], app.normalize_name(subject)
    from core.message_threads where tenant_id = t and status = 'active' and subject is not null
    on conflict (tenant_id, entity_type, entity_id) do nothing;

    insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, text_vector)
    select tenant_id, 'message', id, 'message_thread', thread_id,
           to_tsvector('arabic'::regconfig, left(body, 200000)) || to_tsvector('english'::regconfig, left(body, 200000))
    from core.messages where tenant_id = t and status = 'active'
    on conflict (tenant_id, entity_type, entity_id) do nothing;
  end loop;
end $$;
