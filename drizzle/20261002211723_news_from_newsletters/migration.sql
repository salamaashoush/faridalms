-- A newsletter edition becomes a school news post: the same story kept once,
-- shown on the website only when it is public. What the generated migration
-- cannot express for post audiences and recipients comes first: row triggers,
-- forced row level security and grants, and the search index on post titles.

create trigger row_meta before insert or update on core.site_post_audiences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_post_recipients for each row execute function app.row_meta();

alter table core.site_post_audiences force row level security;
alter table core.site_post_recipients force row level security;

grant select, insert, update on core.site_post_audiences, core.site_post_recipients to app, worker, cell_io;
grant select on core.site_post_audiences, core.site_post_recipients to retention;

create trigger index_host after insert or update of title_ar, title_en, status, org_id on core.site_posts
  for each row execute function app.index_host('site_post', 'title_ar', 'title_en');

alter table core.notifications drop constraint notifications_kind_check;

-- An edition keeps its id as a post, so its documents, files, notices and
-- search entries only change their host type. Moving a document between
-- hosts is otherwise refused, so the guard rests for this one statement set.
alter table core.documents disable trigger documents_frozen_guard;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, name_norm)
    select tenant_id, 'site_post', id, 'site_post', id, array[org_id],
           app.normalize_name(nullif(trim(concat_ws(' ', title_ar, title_en)), ''))
    from core.site_posts
    where tenant_id = t and status = 'active' and (title_ar <> '' or title_en <> '')
    on conflict (tenant_id, entity_type, entity_id) do nothing;

    -- A website post kept its translation check inside its words; it moves to
    -- the post, by its author, against the original as it reads now.
    update core.site_posts p
    set translation_reviewed_at = statement_timestamp(),
        translation_reviewed_by_user_id = p.author_user_id,
        translation_source_digest = (
          select md5(btrim(regexp_replace(o.plain_text, '\s+', ' ', 'g')))
          from core.documents o
          where o.tenant_id = p.tenant_id and o.host_type = 'site_post' and o.host_id = p.id
            and o.status = 'active' and o.translation_of_id is null
          order by o.date_last_modified desc limit 1)
    where p.tenant_id = t and p.status = 'active' and p.translation_reviewed_at is null
      and exists (
        select 1 from core.documents d
        where d.tenant_id = p.tenant_id and d.host_type = 'site_post' and d.host_id = p.id
          and d.status = 'active' and d.translation_of_id is not null
          and d.content->>'reviewed' = 'true');

    -- Posts held their words as {body}; with the check gone from them they
    -- hold the document itself, as every other host does.
    update core.document_versions v set content = v.content->'body'
    from core.documents d
    where v.tenant_id = t and d.tenant_id = v.tenant_id and d.id = v.document_id
      and d.host_type = 'site_post' and jsonb_typeof(v.content->'body') = 'object';
    update core.documents set content = content->'body'
    where tenant_id = t and host_type = 'site_post' and jsonb_typeof(content->'body') = 'object';

    insert into core.site_posts (tenant_id, id, org_id, slug, title_en, title_ar, state, visibility,
      published_at, author_user_id, translation_reviewed_at, translation_reviewed_by_user_id,
      translation_source_digest, created_at)
    select n.tenant_id, n.id, n.org_id, 'newsletter-' || replace(n.id::text, '-', ''),
           case when n.primary_locale = 'en' then n.title else '' end,
           case when n.primary_locale = 'ar' then n.title else '' end,
           case n.state when 'scheduled' then 'published' else n.state end,
           'school',
           case when n.state in ('scheduled', 'published') then n.publish_at end,
           n.author_user_id, n.translation_reviewed_at, n.translation_reviewed_by_user_id,
           n.translation_source_digest, n.created_at
    from core.newsletters n
    where n.tenant_id = t and n.status = 'active';

    insert into core.site_post_audiences (tenant_id, post_id, scope, class_id, grade_descriptor_id)
    select a.tenant_id, a.newsletter_id, a.scope, a.class_id, a.grade_descriptor_id
    from core.newsletter_audiences a
    join core.site_posts p on p.tenant_id = a.tenant_id and p.id = a.newsletter_id
    where a.tenant_id = t and a.status = 'active';

    insert into core.site_post_recipients (tenant_id, post_id, user_id, read_at, created_at)
    select r.tenant_id, r.newsletter_id, r.user_id, r.read_at, r.created_at
    from core.newsletter_recipients r
    join core.site_posts p on p.tenant_id = r.tenant_id and p.id = r.newsletter_id
    where r.tenant_id = t and r.status = 'active';

    update core.documents set host_type = 'site_post', kind = 'rich_text'
    where tenant_id = t and host_type = 'newsletter';

    update core.files set host_type = 'site_post'
    where tenant_id = t and host_type = 'newsletter';

    delete from search.entries where tenant_id = t and entity_type = 'newsletter';
    update search.entries set result_type = 'site_post'
    where tenant_id = t and result_type = 'newsletter';

    update core.notifications set kind = 'news'
    where tenant_id = t and kind = 'newsletter';
    update core.notifications set subject_type = 'site_post'
    where tenant_id = t and subject_type = 'newsletter';

    update core.user_preferences
    set value = jsonb_set(
          jsonb_set(value, '{email}',
            ((value->'email') - 'newsletter')
              || jsonb_strip_nulls(jsonb_build_object('news', value->'email'->'newsletter'))),
          '{sms}',
          ((value->'sms') - 'newsletter')
            || jsonb_strip_nulls(jsonb_build_object('news', value->'sms'->'newsletter')))
    where tenant_id = t and key = 'notifications' and status = 'active'
      and jsonb_typeof(value->'email') = 'object' and jsonb_typeof(value->'sms') = 'object';

    -- Writing news was the newsletter capability; whoever ran the website
    -- wrote its posts, so both keep writing news.
    update core.access_roles
    set capabilities = array(
          select distinct c from unnest(
            array_replace(capabilities, 'newsletters:manage', 'news:manage')
            || case when 'site:manage' = any (capabilities) then array['news:manage'] else '{}'::text[] end
          ) as c order by c)
    where tenant_id = t and status = 'active'
      and ('newsletters:manage' = any (capabilities) or 'site:manage' = any (capabilities));

    update core.descriptors
    set code_value = 'photo_school_news', label_en = 'Photos in school news',
        label_ar = 'الصور في أخبار المدرسة'
    where tenant_id = t and namespace = 'consent_purpose' and code_value = 'photo_newsletter';
  end loop;
end $$;

alter table core.documents enable trigger documents_frozen_guard;

alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder'));
