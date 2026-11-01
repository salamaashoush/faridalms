-- What the generated migration cannot express for one conversation system:
-- the outside contacts' forced row level security, grants and row trigger;
-- keys added NOT VALID to tables that already hold rows; the delivery
-- ledger's second kind of recipient; what search may index; erasure of
-- conversations, contacts and enquiries; and the moves into Messages of
-- every enquiry's thread, every logged attendance call, every message's
-- words as a document, and the office's reply wording as templates.

create trigger row_meta before insert or update on core.message_contacts
  for each row execute function app.row_meta();
alter table core.message_contacts force row level security;
grant select, insert, update on core.message_contacts to app, worker, cell_io;
grant select on core.message_contacts to retention;

-- Not valid, as every key added to a table that already holds rows here:
-- checking them would read the table under forced row security without a
-- tenant. The columns are new and empty, and every row written is checked.
alter table core.thread_members
  add constraint thread_members_tenant_id_contact_id_fkey
    foreign key (tenant_id, contact_id) references core.message_contacts (tenant_id, id) not valid;
alter table core.messages
  add constraint messages_tenant_id_author_contact_id_fkey
    foreign key (tenant_id, author_contact_id) references core.message_contacts (tenant_id, id) not valid;
alter table core.site_enquiries
  add constraint site_enquiries_tenant_id_thread_id_fkey
    foreign key (tenant_id, thread_id) references core.message_threads (tenant_id, id) not valid;
alter table core.erasure_approvals
  add constraint erasure_approvals_tenant_id_subject_contact_id_fkey
    foreign key (tenant_id, subject_contact_id) references core.message_contacts (tenant_id, id) not valid;

-- A delivery either tells a person about a notification, as before, or
-- carries one message of a conversation to an outside contact by email.
alter table core.notification_deliveries
  alter column notification_id drop not null,
  alter column notification_created_at drop not null,
  alter column user_id drop not null,
  add column contact_id uuid,
  add column message_id uuid;
alter table core.notification_deliveries
  add constraint notification_deliveries_recipient_check check (
    (user_id is not null and notification_id is not null and notification_created_at is not null
      and contact_id is null and message_id is null)
    or (user_id is null and notification_id is null and notification_created_at is null
      and contact_id is not null and message_id is not null));
alter table core.notification_deliveries
  add constraint notification_deliveries_tenant_id_contact_id_fkey
    foreign key (tenant_id, contact_id) references core.message_contacts (tenant_id, id),
  add constraint notification_deliveries_tenant_id_message_id_fkey
    foreign key (tenant_id, message_id) references core.messages (tenant_id, id);
create index notification_deliveries_message_idx on core.notification_deliveries (tenant_id, message_id)
  where message_id is not null;

-- Only what everyone in a conversation reads is searchable: a family that
-- finds its conversation by a word must never be shown a staff note. A
-- message's document is found through the message, never on its own.
create or replace function app.index_message() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.kind <> 'message' or new.redacted_at is not null then
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
drop trigger index_message on core.messages;
create trigger index_message after insert or update of body, status, redacted_at on core.messages
  for each row execute function app.index_message();

create or replace function app.index_document() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.host_type = 'message' then
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
revoke all on function app.index_message(), app.index_document() from public;

-- An erasure names a person or an outside contact, and either reaches the
-- rows that name it. A legal hold names people only: a contact who never
-- had an account has none.
create or replace function app.erasure_approved(p_tenant uuid, p_subject uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_subject is not null
    and exists (select 1 from core.erasure_approvals a
                where a.tenant_id = p_tenant
                  and (a.subject_user_id = p_subject or a.subject_contact_id = p_subject))
    and not exists (select 1 from core.legal_holds h
                    where h.tenant_id = p_tenant and h.subject_user_id = p_subject
                      and h.status = 'active' and h.released_at is null)
$$;

create or replace function app.erasure_listed(p_tenant uuid, p_type text, p_object uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from core.erasure_items i
                 join core.erasure_approvals a on a.tenant_id = i.tenant_id and a.id = i.approval_id
                 where i.tenant_id = p_tenant and i.object_type = p_type and i.object_id = p_object
                   and app.erasure_approved(a.tenant_id, coalesce(a.subject_user_id, a.subject_contact_id)))
$$;
revoke all on function app.erasure_approved(uuid, uuid), app.erasure_listed(uuid, text, uuid) from public;
grant execute on function app.erasure_approved(uuid, uuid), app.erasure_listed(uuid, text, uuid) to retention;

grant update (status, metadata, email, phone, phone_normalized, display_name) on core.message_contacts to retention;
grant update (status, metadata, subject) on core.message_threads to retention;
grant update (status, metadata, draft) on core.thread_members to retention;
grant update (body, details, redacted_at) on core.messages to retention;
grant update (status, metadata, name, email, phone, phone_normalized, child_name, child_year, message,
  answers, network_key) on core.site_enquiries to retention;
grant update (address) on core.notification_deliveries to retention;
create policy p_erase_update on core.notification_deliveries for update to retention
  using (app.erasure_approved(tenant_id, contact_id)
    or exists (select 1 from core.message_contacts c where c.tenant_id = notification_deliveries.tenant_id
      and c.id = notification_deliveries.contact_id and app.erasure_approved(c.tenant_id, c.user_id)))
  with check (address is null);

-- A phone read in E.164 as the people system reads it (domain/phone.ts
-- toE164), for the numbers already kept.
create or replace function pg_temp.e164(p_text text, p_country text) returns text
language sql immutable
as $$
  with cleaned as (select replace(coalesce(p_text, ''), '(0)', '') as t),
  digits as (select t, regexp_replace(t, '\D', '', 'g') as d from cleaned),
  number as (
    select case
      when d = '' then null
      when t ~ '^[^0-9]*\+' then d
      when d like '00%' then substr(d, 3)
      else (case p_country when 'EG' then '20' when 'SA' then '966' when 'AE' then '971'
        when 'KW' then '965' when 'QA' then '974' when 'BH' then '973' when 'OM' then '968'
        when 'JO' then '962' when 'GB' then '44' when 'US' then '1' end)
        || regexp_replace(d, '^0+', '')
    end as n from digits)
  select case when n ~ '^[1-9][0-9]{6,14}$' then '+' || n end from number
$$;

-- Every enquiry becomes a conversation in the admissions mailbox: the
-- family is its outside contact, a website enquiry opens with the family's
-- words, and each entry of its old thread is an entry of the conversation
-- at the moment it was written. A note, call, email or meeting stays
-- internal; a reply that was emailed becomes a message to the family; a
-- change of state or holder becomes an event. Each logged attendance call
-- becomes a logged call in the attendance office's conversation with the
-- child's family. `migratedFrom` names the old row, so the release that
-- drops the old tables can copy whatever an older release still wrote
-- there after this ran.
--
-- The row trigger stamps every insert with the current time, which would
-- date years of history to today, so it is held off while entries are
-- written with their own times. The conversations themselves are dated
-- now: what staff had already worked is not unread to them.
alter table core.messages disable trigger row_meta;

do $$
declare
  t uuid;
  e record;
  n record;
  a record;
  contact uuid;
  thread uuid;
  school text;
  first_words text;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    -- An applying family reads and answers its conversations with the
    -- school, as every family does.
    update core.access_roles
    set capabilities = capabilities || array['messages:read', 'messages:send']
    where tenant_id = t and builtin_key = 'applicant_family' and status = 'active'
      and not ('messages:read' = any (capabilities));

    update core.site_enquiries x set phone_normalized = pg_temp.e164(x.phone, o.country_code)
    from core.orgs o
    where x.tenant_id = t and o.tenant_id = x.tenant_id and o.id = x.org_id and x.phone <> '';

    insert into core.message_contacts (tenant_id, email, phone, phone_normalized, display_name, locale)
    select distinct on (lower(x.email)) t, lower(x.email), nullif(x.phone, ''), x.phone_normalized,
      x.name, x.locale
    from core.site_enquiries x
    where x.tenant_id = t and x.status = 'active' and x.email <> '' and x.thread_id is null
    order by lower(x.email), x.created_at desc
    on conflict (tenant_id, email) where status = 'active' and email is not null do nothing;

    for e in
      select x.*, o.name_en as school_en, o.name_ar as school_ar
      from core.site_enquiries x
      join core.orgs o on o.tenant_id = x.tenant_id and o.id = x.org_id
      where x.tenant_id = t and x.status = 'active' and x.thread_id is null
      order by x.created_at
    loop
      if e.email <> '' then
        select c.id into contact from core.message_contacts c
        where c.tenant_id = t and c.email = lower(e.email) and c.status = 'active';
      else
        insert into core.message_contacts (tenant_id, phone, phone_normalized, display_name, locale)
        values (t, e.phone, e.phone_normalized, e.name, e.locale)
        returning id into contact;
      end if;

      school := case when e.locale = 'ar' then coalesce(e.school_ar, e.school_en)
        else coalesce(e.school_en, e.school_ar) end;
      insert into core.message_threads (tenant_id, org_id, kind, mailbox, subject, created_by_user_id,
        last_message_at)
      values (t, e.org_id, 'mailbox', 'admissions',
        left(case e.purpose
          when 'visit' then case when e.locale = 'ar' then 'زيارتكم إلى ' else 'Your visit to ' end
          when 'general' then case when e.locale = 'ar' then 'رسالتكم إلى ' else 'Your message to ' end
          else case when e.locale = 'ar' then 'استفساركم لدى ' else 'Your enquiry to ' end
        end || school, 200),
        e.created_by_user_id, e.created_at)
      returning id into thread;

      insert into core.thread_members (tenant_id, thread_id, contact_id, role, joined_at)
      values (t, thread, contact, 'member', e.created_at);
      if e.assignee_user_id is not null then
        insert into core.thread_members (tenant_id, thread_id, user_id, role)
        values (t, thread, e.assignee_user_id, 'owner');
      end if;

      -- A website enquiry opens with the family's words (domain/enquiries.ts
      -- submissionText); one staff logged opens with what they noted down,
      -- as the contact it was (loggedKind).
      first_words := coalesce(nullif(concat_ws(e'\n\n', nullif(trim(e.message), ''),
        (select string_agg((q.a->>'label') || ': ' || (q.a->>'value'), e'\n' order by q.ord)
         from jsonb_array_elements(e.answers) with ordinality as q(a, ord))), ''),
        nullif(concat_ws(', ', nullif(trim(e.child_name), ''), nullif(trim(e.child_year), '')), ''));
      if e.source = 'website' then
        insert into core.messages (tenant_id, thread_id, kind, author_contact_id, body, created_at,
          date_last_modified)
        values (t, thread, 'message', contact, left(coalesce(first_words, '-'), 5000), e.created_at,
          e.created_at);
      elsif first_words is not null and e.created_by_user_id is not null then
        insert into core.messages (tenant_id, thread_id, kind, author_user_id, body, created_at,
          date_last_modified)
        values (t, thread,
          case e.source when 'phone' then 'call' when 'walk_in' then 'meeting' when 'event' then 'meeting'
            when 'email' then 'email' else 'note' end,
          e.created_by_user_id, left(first_words, 5000), e.created_at, e.created_at);
      end if;

      for n in
        select * from core.site_enquiry_entries
        where tenant_id = t and enquiry_id = e.id
        order by created_at, id
      loop
        insert into core.messages (tenant_id, thread_id, kind, author_user_id, body, details,
          created_at, date_last_modified)
        values (t, thread,
          case
            when n.author_user_id is null then 'event'
            when n.kind in ('note', 'call', 'email', 'meeting') then n.kind
            when n.kind = 'reply' then 'message'
            else 'event'
          end,
          n.author_user_id,
          left(n.body, 5000),
          jsonb_strip_nulls(case
            when n.kind = 'state' then jsonb_build_object('event', 'state',
              'from', n.details->'from', 'to', n.details->'to', 'reason', n.details->'reason',
              'automatic', n.details->'automatic')
            when n.kind = 'assigned' then jsonb_build_object('event', 'assigned',
              'assigneeId', n.details->'assigneeId', 'nameEn', n.details->'nameEn',
              'nameAr', n.details->'nameAr')
            else '{}'::jsonb
          end) || jsonb_build_object('migratedFrom', n.id),
          n.created_at, n.created_at);
      end loop;

      update core.message_threads
      set last_message_at = greatest(e.created_at, (select max(created_at) from core.messages
        where tenant_id = t and thread_id = thread and kind <> 'event'))
      where tenant_id = t and id = thread;
      update core.site_enquiries set thread_id = thread where tenant_id = t and id = e.id;
    end loop;

    for a in
      select c.* from core.attendance_contacts c
      where c.tenant_id = t and c.status = 'active'
        and not exists (select 1 from core.messages m
          where m.tenant_id = t and m.details ->> 'migratedFrom' = c.id::text)
      order by c.created_at
    loop
      select h.id into thread from core.message_threads h
      where h.tenant_id = t and h.org_id = a.org_id and h.mailbox = 'attendance'
        and h.student_user_id = a.student_user_id and h.status = 'active';
      if thread is null then
        insert into core.message_threads (tenant_id, org_id, kind, mailbox, student_user_id,
          created_by_user_id, last_message_at)
        values (t, a.org_id, 'mailbox', 'attendance', a.student_user_id, a.recorded_by_user_id,
          a.created_at)
        returning id into thread;
        insert into core.thread_members (tenant_id, thread_id, user_id, role)
        select distinct t, thread, l.related_user_id, 'member' from core.user_relationships l
        where l.tenant_id = t and l.student_user_id = a.student_user_id and l.status = 'active'
          and l.portal_access and not coalesce(l.communication_isolated, false)
          and l.valid_during @> a.day_on;
      end if;
      insert into core.messages (tenant_id, thread_id, kind, author_user_id, body, details,
        created_at, date_last_modified)
      values (t, thread, 'call', a.recorded_by_user_id, coalesce(a.note, ''),
        jsonb_build_object('outcome', a.outcome, 'studentId', a.student_user_id, 'on', a.day_on,
          'migratedFrom', a.id),
        a.created_at, a.created_at);
      update core.message_threads set last_message_at = greatest(last_message_at, a.created_at)
      where tenant_id = t and id = thread;
      thread := null;
    end loop;

    -- What every entry says, as a frozen document of the shared editor:
    -- one paragraph per line of its text, then a block for each file it
    -- carried, which the document now keeps (content-conversion.ts
    -- plainContent and fileBlocks).
    insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, content,
      plain_text, frozen_at, last_edited_by_user_id, last_edited_at)
    select x.tenant_id, 'message', x.id, h.org_id, 'rich_text', 1,
      jsonb_build_object('root', jsonb_build_object('type', 'root', 'version', 1, 'direction', null,
        'format', '', 'indent', 0, 'children',
        coalesce((select jsonb_agg(jsonb_build_object('type', 'paragraph', 'version', 1,
            'direction', null, 'format', '', 'indent', 0, 'textFormat', 0, 'textStyle', '',
            'children', case when l.line = '' then '[]'::jsonb else jsonb_build_array(
              jsonb_build_object('type', 'text', 'version', 1, 'format', 0, 'detail', 0,
                'mode', 'normal', 'style', '', 'text', l.line)) end) order by l.ord)
          from regexp_split_to_table(x.body, e'\n') with ordinality as l(line, ord)
          where x.body <> ''), '[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('type', 'file', 'version', 1, 'format', '',
            'fileId', f.id, 'name', f.name, 'mime', f.media_type, 'bytes', f.size_bytes)
            order by f.created_at, f.id)
          from core.files f
          where f.tenant_id = x.tenant_id and f.host_type = 'message' and f.host_id = x.id
            and f.status = 'active' and f.state = 'ready'), '[]'::jsonb))),
      x.body, x.created_at, x.author_user_id, x.created_at
    from core.messages x
    join core.message_threads h on h.tenant_id = x.tenant_id and h.id = x.thread_id
    where x.tenant_id = t and x.kind <> 'event'
      and (x.body <> '' or exists (select 1 from core.files f
        where f.tenant_id = x.tenant_id and f.host_type = 'message' and f.host_id = x.id
          and f.status = 'active'))
      and not exists (select 1 from core.documents d
        where d.tenant_id = x.tenant_id and d.host_type = 'message' and d.host_id = x.id);
    insert into core.document_files (tenant_id, document_id, file_id, file_purpose)
    select d.tenant_id, d.id, f.id, f.purpose
    from core.documents d
    join core.files f on f.tenant_id = d.tenant_id and f.host_type = 'message' and f.host_id = d.host_id
      and f.status = 'active' and f.state = 'ready'
    where d.tenant_id = t and d.host_type = 'message'
      and not exists (select 1 from core.document_files g
        where g.tenant_id = d.tenant_id and g.document_id = d.id and g.file_id = f.id);

    -- The replies the office sends most, as templates the school may edit
    -- (domain/templates.ts BUILTIN_MESSAGE_TEMPLATES), in each language.
    insert into core.document_templates (tenant_id, org_id, kind, builtin_key, title, state)
    select t, o.id, 'message', w.key, w.title, 'shared'
    from core.orgs o
    cross join (values
      ('enquiry_thanks_en', 'Thank you for your enquiry'),
      ('enquiry_thanks_ar', 'شكرًا لاستفساركم'),
      ('enquiry_visit_en', 'Arranging a visit'),
      ('enquiry_visit_ar', 'ترتيب زيارة'),
      ('enquiry_information_en', 'A little more about your child'),
      ('enquiry_information_ar', 'معلومات إضافية عن طفلكم'),
      ('enquiry_places_en', 'No place at the moment'),
      ('enquiry_places_ar', 'لا يتوفر مقعد حاليًا'),
      ('enquiry_general_en', 'Thank you for your message'),
      ('enquiry_general_ar', 'شكرًا لرسالتكم')) as w(key, title)
    where o.tenant_id = t and o.type = 'school' and o.status = 'active'
    on conflict (tenant_id, org_id, builtin_key) where builtin_key is not null do nothing;
    insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, locale,
      content, plain_text)
    select g.tenant_id, 'document_template', g.id, g.org_id, 'rich_text', 1, right(g.builtin_key, 2),
      jsonb_build_object('root', jsonb_build_object('type', 'root', 'version', 1, 'direction', null,
        'format', '', 'indent', 0, 'children',
        (select jsonb_agg(jsonb_build_object('type', 'paragraph', 'version', 1,
            'direction', null, 'format', '', 'indent', 0, 'textFormat', 0, 'textStyle', '',
            'children', case when l.line = '' then '[]'::jsonb else jsonb_build_array(
              jsonb_build_object('type', 'text', 'version', 1, 'format', 0, 'detail', 0,
                'mode', 'normal', 'style', '', 'text', l.line)) end) order by l.ord)
          from regexp_split_to_table(w.body, e'\n') with ordinality as l(line, ord)))),
      w.body
    from core.document_templates g
    join (values
      ('enquiry_thanks_en', e'Dear {name},\n\nThank you for your interest in {school}. We have received your enquiry and would be glad to tell you more about the school and how admission works.\n\nPlease reply to this email with any questions, or let us know a good time to call you.\n\nKind regards,\n{sender}\n{school}'),
      ('enquiry_thanks_ar', e'مرحبًا {name}،\n\nنشكركم على اهتمامكم بـ{school}. وصلنا استفساركم، ويسعدنا أن نعرّفكم بالمدرسة وبخطوات القبول.\n\nيمكنكم الرد على هذه الرسالة بأي سؤال، أو إخبارنا بالوقت المناسب للاتصال بكم.\n\nمع خالص التحية،\n{sender}\n{school}'),
      ('enquiry_visit_en', e'Dear {name},\n\nThank you for asking to visit. We would be delighted to show you around and answer your questions in person.\n\nPlease reply with two or three days and times that suit you, and we will confirm one.\n\nKind regards,\n{sender}\n{school}'),
      ('enquiry_visit_ar', e'مرحبًا {name}،\n\nنشكركم على طلب الزيارة، ويسعدنا أن نرافقكم في جولة بالمدرسة ونجيب عن أسئلتكم.\n\nنرجو الرد بيومين أو ثلاثة وبالأوقات المناسبة لكم، وسنؤكد لكم أحدها.\n\nمع خالص التحية،\n{sender}\n{school}'),
      ('enquiry_information_en', e'Dear {name},\n\nThank you for your enquiry. To advise you properly, could you tell us {child}''s date of birth, the year you are hoping for, and the school {child} attends now?\n\nKind regards,\n{sender}\n{school}'),
      ('enquiry_information_ar', e'مرحبًا {name}،\n\nنشكركم على استفساركم. حتى نتمكن من إفادتكم على النحو الصحيح، نرجو إخبارنا بتاريخ ميلاد {child}، والصف الذي ترغبون في التقديم له، ومدرسته الحالية إن وُجدت.\n\nمع خالص التحية،\n{sender}\n{school}'),
      ('enquiry_places_en', e'Dear {name},\n\nThank you for your enquiry. We do not have a place in the year you asked about at the moment. We would be glad to keep your details and contact you as soon as one becomes available.\n\nKind regards,\n{sender}\n{school}'),
      ('enquiry_places_ar', e'مرحبًا {name}،\n\nنشكركم على استفساركم. لا يتوفر لدينا حاليًا مقعد في الصف الذي سألتم عنه، ويسعدنا الاحتفاظ ببياناتكم والتواصل معكم فور توفر مقعد.\n\nمع خالص التحية،\n{sender}\n{school}'),
      ('enquiry_general_en', e'Dear {name},\n\nThank you for your message.\n\n\n\nKind regards,\n{sender}\n{school}'),
      ('enquiry_general_ar', e'مرحبًا {name}،\n\nنشكركم على رسالتكم.\n\n\n\nمع خالص التحية،\n{sender}\n{school}'))
      as w(key, body) on w.key = g.builtin_key
    where g.tenant_id = t and not exists (select 1 from core.documents d
      where d.tenant_id = g.tenant_id and d.host_type = 'document_template' and d.host_id = g.id);
  end loop;
end $$;

alter table core.messages enable trigger row_meta;
