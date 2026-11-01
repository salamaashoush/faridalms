-- Announcements and news posts become the two kinds of one broadcast. What
-- the generated migration cannot express comes first: row triggers, forced
-- row level security, grants, and the search index on titles, one trigger
-- per kind since the kind names the entry.

create trigger row_meta before insert or update on core.broadcasts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcast_audiences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcast_recipients for each row execute function app.row_meta();

alter table core.broadcasts force row level security;
alter table core.broadcast_audiences force row level security;
alter table core.broadcast_recipients force row level security;

grant select, insert, update on core.broadcasts, core.broadcast_audiences, core.broadcast_recipients
  to app, worker, cell_io;
grant select on core.broadcasts, core.broadcast_audiences, core.broadcast_recipients to retention;

create trigger index_announcement after insert or update of title_ar, title_en, status, org_id on core.broadcasts
  for each row when (new.kind = 'announcement')
  execute function app.index_host('announcement', 'title_ar', 'title_en');
create trigger index_news after insert or update of title_ar, title_en, status, org_id on core.broadcasts
  for each row when (new.kind = 'news')
  execute function app.index_host('news', 'title_ar', 'title_en');

-- Every row keeps its id, so a broadcast's documents, files, notices,
-- website copies and search entries keep pointing at it; a news post's only
-- change their host type from the table it left to its kind. Moving a
-- document between hosts is otherwise refused, so the guard rests for this
-- one statement set. A scheduled broadcast whose time came before this ran
-- was never told; it is left untold, so the clock tells it if it is recent.

alter table core.documents disable trigger documents_frozen_guard;

do $$
declare
  t uuid;
  expected bigint;
  moved bigint;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    update search.entries set entity_type = 'news'
    where tenant_id = t and entity_type = 'site_post';
    update search.entries set result_type = 'news'
    where tenant_id = t and result_type = 'site_post';

    insert into core.broadcasts (tenant_id, id, org_id, kind, title_en, title_ar, state, publish_at,
      told_at, visibility, author_user_id, translation_reviewed_at, translation_reviewed_by_user_id,
      translation_source_digest, urgency, pinned_until, expires_on, requires_ack, ack_due_on,
      update_sent_at, status, version, metadata, created_at)
    select a.tenant_id, a.id, a.org_id, 'announcement', a.title_en, a.title_ar,
           case a.state when 'scheduled' then 'published' else a.state end,
           a.publish_at,
           case when a.state in ('published', 'archived') then a.publish_at end,
           'school', a.author_user_id, a.translation_reviewed_at, a.translation_reviewed_by_user_id,
           a.translation_source_digest, a.urgency, a.pinned_until, a.expires_on, a.requires_ack,
           a.ack_due_on, a.update_sent_at, a.status, a.version, a.metadata, a.created_at
    from core.announcements a
    where a.tenant_id = t;

    insert into core.broadcasts (tenant_id, id, org_id, kind, title_en, title_ar, state, publish_at,
      told_at, visibility, author_user_id, translation_reviewed_at, translation_reviewed_by_user_id,
      translation_source_digest, category_id, slug, excerpt_en, excerpt_ar, cover_file_id,
      cover_alt_en, cover_alt_ar, pinned, status, version, metadata, created_at)
    select p.tenant_id, p.id, p.org_id, 'news', p.title_en, p.title_ar, p.state, p.published_at,
           case
             when p.state = 'archived' then p.published_at
             when p.state = 'published' and p.published_at <= statement_timestamp()
               and (exists (select 1 from core.notifications n
                            where n.tenant_id = p.tenant_id and n.subject_type = 'site_post'
                              and n.subject_id = p.id and n.kind = 'news')
                    or not exists (select 1 from core.site_post_recipients r
                                   where r.tenant_id = p.tenant_id and r.post_id = p.id
                                     and r.status = 'active'))
               then p.published_at
           end,
           p.visibility, p.author_user_id, p.translation_reviewed_at, p.translation_reviewed_by_user_id,
           p.translation_source_digest, p.category_id, p.slug, p.excerpt_en, p.excerpt_ar,
           p.cover_file_id, p.cover_alt_en, p.cover_alt_ar, p.pinned, p.status,
           p.version, p.metadata, p.created_at
    from core.site_posts p
    where p.tenant_id = t;

    -- An announcement's readers read its words as they were being written;
    -- they now read its published copy, which is those words as they stand.
    insert into core.document_versions (tenant_id, document_id, document_version, reason, content,
      plain_text, created_by_user_id)
    select d.tenant_id, d.id, d.version, 'publish', d.content, d.plain_text, a.author_user_id
    from core.documents d
    join core.announcements a on a.tenant_id = d.tenant_id and a.id = d.host_id
    where d.tenant_id = t and d.host_type = 'announcement' and d.status = 'active'
      and a.state in ('scheduled', 'published', 'archived')
    on conflict do nothing;

    insert into core.broadcast_audiences (tenant_id, id, broadcast_id, scope, class_id,
      grade_descriptor_id, grade_ns, status, version, metadata, created_at)
    select tenant_id, id, announcement_id, scope, class_id, grade_descriptor_id, grade_ns, status,
           version, metadata, created_at
    from core.announcement_audiences where tenant_id = t
    union all
    select tenant_id, id, post_id, scope, class_id, grade_descriptor_id, grade_ns, status,
           version, metadata, created_at
    from core.site_post_audiences where tenant_id = t;

    insert into core.broadcast_recipients (tenant_id, id, broadcast_id, user_id, read_at,
      acknowledged_at, status, version, metadata, created_at)
    select tenant_id, id, announcement_id, user_id, read_at, acknowledged_at, status, version,
           metadata, created_at
    from core.announcement_recipients where tenant_id = t
    union all
    select tenant_id, id, post_id, user_id, read_at, null, status, version, metadata, created_at
    from core.site_post_recipients where tenant_id = t;

    select (select count(*) from core.announcements where tenant_id = t)
         + (select count(*) from core.site_posts where tenant_id = t) into expected;
    select count(*) from core.broadcasts where tenant_id = t into moved;
    if moved <> expected then
      raise exception 'tenant %: % of % announcements and posts became broadcasts', t, moved, expected;
    end if;
    select (select count(*) from core.announcement_audiences where tenant_id = t)
         + (select count(*) from core.site_post_audiences where tenant_id = t) into expected;
    select count(*) from core.broadcast_audiences where tenant_id = t into moved;
    if moved <> expected then
      raise exception 'tenant %: % of % audiences moved', t, moved, expected;
    end if;
    select (select count(*) from core.announcement_recipients where tenant_id = t)
         + (select count(*) from core.site_post_recipients where tenant_id = t) into expected;
    select count(*) from core.broadcast_recipients where tenant_id = t into moved;
    if moved <> expected then
      raise exception 'tenant %: % of % recipients moved', t, moved, expected;
    end if;

    update core.documents set host_type = 'news'
    where tenant_id = t and host_type = 'site_post';
    update core.files set host_type = 'news'
    where tenant_id = t and host_type = 'site_post';
    update core.file_publications set host_type = 'news'
    where tenant_id = t and host_type = 'site_post';
    update core.notifications set subject_type = 'news'
    where tenant_id = t and subject_type = 'site_post';
  end loop;
end $$;

alter table core.documents enable trigger documents_frozen_guard;

-- The website's copy of a post now belongs to its broadcast. The next
-- migration drops the post tables before it moves this key, which their
-- removal would otherwise refuse, so the key moves here first. A new key is
-- checked against every row, which forced row level security would hide
-- from the owner without a tenant bound, so it rests until the key is in
-- place and the migration after the next forces it again.
alter table core.site_published_posts no force row level security;
alter table core.site_published_posts
  drop constraint site_published_posts_tenant_id_post_id_fkey,
  add constraint site_published_posts_tenant_id_post_id_fkey
    foreign key (tenant_id, post_id) references core.broadcasts (tenant_id, id);
