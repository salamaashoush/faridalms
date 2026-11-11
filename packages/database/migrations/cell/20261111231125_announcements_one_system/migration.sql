-- News posts become announcements: one kind of broadcast, which may also be
-- on the website. Every row keeps its id, so only the names that pointed at
-- the news kind change: the host type of its documents, files, holds, notices
-- and search entries, mentions of a post inside any document, templates kept
-- for news, and the news:manage capability, which every role holding it
-- trades for announcements:manage. The audit log keeps its entries as they
-- were written; it is hash-chained and never rewritten.

drop trigger index_announcement on core.broadcasts;
drop trigger index_news on core.broadcasts;

alter table core.documents disable trigger documents_frozen_guard;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    update core.documents set host_type = 'announcement'
    where tenant_id = t and host_type = 'news';
    update core.document_holds set host_type = 'announcement'
    where tenant_id = t and host_type = 'news';
    update core.files set host_type = 'announcement'
    where tenant_id = t and host_type = 'news';
    update core.file_publications set host_type = 'announcement'
    where tenant_id = t and host_type = 'news';

    -- A mention's keys serialise as id, kind, label, so this names only a
    -- mention of a post and no other node.
    update core.documents
    set content = replace(content::text, '"kind": "news", "label":', '"kind": "announcement", "label":')::jsonb
    where tenant_id = t and content::text like '%"kind": "news", "label":%';
    update core.document_versions
    set content = replace(content::text, '"kind": "news", "label":', '"kind": "announcement", "label":')::jsonb
    where tenant_id = t and content::text like '%"kind": "news", "label":%';

    update core.notifications set subject_type = 'announcement'
    where tenant_id = t and subject_type = 'news';
    update core.notifications set kind = 'announcement'
    where tenant_id = t and kind = 'news';

    update search.entries set entity_type = 'announcement'
    where tenant_id = t and entity_type = 'news';
    update search.entries set result_type = 'announcement'
    where tenant_id = t and result_type = 'news';

    update core.document_templates set kind = 'announcement'
    where tenant_id = t and kind = 'news';

    update core.access_roles
    set capabilities = array_remove(capabilities, 'news:manage')
      || case when 'announcements:manage' = any (capabilities) then '{}'::text[]
              else array['announcements:manage'] end
    where tenant_id = t and 'news:manage' = any (capabilities);

    update core.user_preferences p
    set value = (select jsonb_object_agg(c.key,
                   case when jsonb_typeof(c.value) = 'object' then c.value - 'news' else c.value end)
                 from jsonb_each(p.value) c)
    where p.tenant_id = t and p.key = 'notifications' and jsonb_typeof(p.value) = 'object';
  end loop;
end $$;

alter table core.documents enable trigger documents_frozen_guard;

create trigger index_announcement after insert or update of title_ar, title_en, status, org_id on core.broadcasts
  for each row execute function app.index_host('announcement', 'title_ar', 'title_en');

alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'message', 'absence', 'event', 'reminder', 'consent',
    'mention', 'library', 'reply', 'enquiry', 'application', 'correction', 'assignment', 'feedback',
    'grades', 'reenrolment', 'admission_event'));
