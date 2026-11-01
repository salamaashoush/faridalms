-- What the generated migration cannot express for drafts of messages:
-- their forced row level security, trigger and grants, what erasure may
-- empty, keeping a draft's words out of search, and the move of every
-- reply being written, kept until now as plain text on its member row,
-- into a draft whose words are a document.

create trigger row_meta before insert or update on core.message_drafts
  for each row execute function app.row_meta();
alter table core.message_drafts force row level security;
grant select, insert, update on core.message_drafts to app, worker, cell_io;
grant select on core.message_drafts to retention;
grant update (status, metadata, recipient_ids, subject, body) on core.message_drafts to retention;

-- Only its writer reads a draft, so nothing of it is searchable; a
-- message's document is found through the message, never on its own.
create or replace function app.index_document() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.host_type in ('message', 'message_draft') then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'document' and entity_id = new.id;
    delete from search.entries e where e.tenant_id = new.tenant_id and e.entity_type = 'document_translation'
      and e.entity_id in (select t.id from core.document_translations t
                          where t.tenant_id = new.tenant_id and t.document_id = new.id);
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, text_vector)
  values (new.tenant_id, 'document', new.id, new.host_type, new.host_id,
          case when new.org_id is null then '{}'::uuid[] else array[new.org_id] end,
          to_tsvector('arabic'::regconfig, left(new.plain_text, 200000))
          || to_tsvector('english'::regconfig, left(new.plain_text, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, org_ids = excluded.org_ids;
  return new;
end $$;
revoke all on function app.index_document() from public;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    insert into core.message_drafts (tenant_id, org_id, user_id, thread_id, body)
    select m.tenant_id, h.org_id, m.user_id, m.thread_id, m.draft
    from core.thread_members m
    join core.message_threads h on h.tenant_id = m.tenant_id and h.id = m.thread_id
      and h.status = 'active'
    where m.tenant_id = t and m.status = 'active' and m.left_at is null
      and m.user_id is not null and m.draft is not null and m.draft <> ''
      and not exists (select 1 from core.message_drafts d
        where d.tenant_id = m.tenant_id and d.thread_id = m.thread_id and d.user_id = m.user_id
          and d.status = 'active');

    -- One paragraph per line of the text, as content-conversion.ts
    -- plainContent writes it.
    insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, content,
      plain_text, last_edited_by_user_id, last_edited_at)
    select d.tenant_id, 'message_draft', d.id, d.org_id, 'rich_text', 1,
      jsonb_build_object('root', jsonb_build_object('type', 'root', 'version', 1, 'direction', null,
        'format', '', 'indent', 0, 'children',
        coalesce((select jsonb_agg(jsonb_build_object('type', 'paragraph', 'version', 1,
            'direction', null, 'format', '', 'indent', 0, 'textFormat', 0, 'textStyle', '',
            'children', case when l.line = '' then '[]'::jsonb else jsonb_build_array(
              jsonb_build_object('type', 'text', 'version', 1, 'format', 0, 'detail', 0,
                'mode', 'normal', 'style', '', 'text', l.line)) end) order by l.ord)
          from regexp_split_to_table(d.body, e'\n') with ordinality as l(line, ord)), '[]'::jsonb))),
      d.body, d.user_id, d.date_last_modified
    from core.message_drafts d
    where d.tenant_id = t and d.status = 'active'
      and not exists (select 1 from core.documents x
        where x.tenant_id = d.tenant_id and x.host_type = 'message_draft' and x.host_id = d.id);
  end loop;
end $$;
