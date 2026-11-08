-- The last copy into Messages before the old enquiry threads and attendance
-- calls go. A release from before the move into conversations may have kept
-- running beside the one that made it, and written there afterwards: an
-- enquiry with no conversation, an entry in an enquiry's thread, a call
-- logged about an absence. Each is brought in as the move brought in the
-- rest, every copied row naming the one it came from in `migratedFrom`, so
-- nothing is copied twice; the generated migration after this one drops
-- both tables.
--
-- The row trigger stamps every insert with the current time, so it is held
-- off while entries are written with the times they were first written at.
alter table core.messages disable trigger row_meta;

-- A phone read in E.164 as the people system reads it (domain/phone.ts toE164).
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

create temporary table contract_threads (tenant_id uuid, thread_id uuid) on commit drop;

do $$
declare
  t uuid;
  e record;
  a record;
  contact uuid;
  thread uuid;
  school text;
  first_words text;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    -- An enquiry an older release took in has no conversation yet: it gets
    -- one in the admissions mailbox as the move gave every enquiry.
    update core.site_enquiries x set phone_normalized = pg_temp.e164(x.phone, o.country_code)
    from core.orgs o
    where x.tenant_id = t and o.tenant_id = x.tenant_id and o.id = x.org_id
      and x.thread_id is null and x.phone <> '' and x.phone_normalized is null;

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
      insert into contract_threads values (t, thread);

      insert into core.thread_members (tenant_id, thread_id, contact_id, role, joined_at)
      values (t, thread, contact, 'member', e.created_at);
      if e.assignee_user_id is not null then
        insert into core.thread_members (tenant_id, thread_id, user_id, role)
        values (t, thread, e.assignee_user_id, 'owner');
      end if;

      -- A website enquiry opens with the family's words; one staff logged
      -- opens with what they noted down, as the contact it was.
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
      update core.site_enquiries set thread_id = thread where tenant_id = t and id = e.id;
    end loop;

    -- Every entry of an enquiry's old thread not yet in its conversation,
    -- at the moment it was written: a note, call, email or meeting stays
    -- internal, a reply becomes a message to the family, a change of state
    -- or holder an event.
    with copied as (
      insert into core.messages (tenant_id, thread_id, kind, author_user_id, body, details,
        created_at, date_last_modified)
      select t, x.thread_id,
        case
          when n.author_user_id is null then 'event'
          when n.kind in ('note', 'call', 'email', 'meeting') then n.kind
          when n.kind = 'reply' then 'message'
          else 'event'
        end,
        n.author_user_id,
        case when n.author_user_id is not null and n.kind in ('note', 'reply') and n.body = ''
          then '-' else left(n.body, 5000) end,
        jsonb_strip_nulls(case
          when n.kind = 'state' then jsonb_build_object('event', 'state',
            'from', n.details->'from', 'to', n.details->'to', 'reason', n.details->'reason',
            'automatic', n.details->'automatic')
          when n.kind = 'assigned' then jsonb_build_object('event', 'assigned',
            'assigneeId', n.details->'assigneeId', 'nameEn', n.details->'nameEn',
            'nameAr', n.details->'nameAr')
          else '{}'::jsonb
        end) || jsonb_build_object('migratedFrom', n.id),
        n.created_at, n.created_at
      from core.site_enquiry_entries n
      join core.site_enquiries x on x.tenant_id = n.tenant_id and x.id = n.enquiry_id
        and x.status = 'active' and x.thread_id is not null
      join core.message_threads h on h.tenant_id = x.tenant_id and h.id = x.thread_id
        and h.status = 'active'
      where n.tenant_id = t
        and not exists (select 1 from core.messages m
          where m.tenant_id = t and m.details ->> 'migratedFrom' = n.id::text)
      order by n.created_at, n.id
      returning thread_id)
    insert into contract_threads select distinct t, thread_id from copied;

    for a in
      select c.* from core.attendance_contacts c
      where c.tenant_id = t and c.status = 'active'
        and not exists (select 1 from core.messages m
          where m.tenant_id = t and m.details ->> 'migratedFrom' = c.id::text)
      order by c.created_at
    loop
      select h.id into thread from core.message_threads h
      where h.tenant_id = t and h.org_id = a.org_id and h.mailbox = 'attendance'
        and h.student_user_id = a.student_user_id and h.status = 'active'
      order by h.created_at limit 1;
      if thread is null then
        insert into core.message_threads (tenant_id, org_id, kind, mailbox, student_user_id,
          created_by_user_id, last_message_at)
        values (t, a.org_id, 'mailbox', 'attendance', a.student_user_id, a.recorded_by_user_id,
          a.created_at)
        returning id into thread;
        insert into core.thread_members (tenant_id, thread_id, user_id, role)
        select distinct t, thread, l.related_user_id, 'member' from core.user_relationships l
        where l.tenant_id = t and l.student_user_id = a.student_user_id
          and app.guardian_permits(l, a.day_on, 'contact');
      end if;
      insert into core.messages (tenant_id, thread_id, kind, author_user_id, body, details,
        created_at, date_last_modified)
      values (t, thread, 'call', a.recorded_by_user_id, coalesce(a.note, ''),
        jsonb_build_object('outcome', a.outcome, 'studentId', a.student_user_id, 'on', a.day_on,
          'migratedFrom', a.id),
        a.created_at, a.created_at);
      insert into contract_threads values (t, thread);
      thread := null;
    end loop;

    -- A conversation that gained an entry sits in the inbox by its latest.
    update core.message_threads h
    set last_message_at = greatest(h.last_message_at, (select max(x.created_at) from core.messages x
      where x.tenant_id = h.tenant_id and x.thread_id = h.id and x.kind <> 'event'))
    where h.tenant_id = t and h.id in (select thread_id from contract_threads where tenant_id = t);

    -- What every copied entry says, as a frozen document of the shared
    -- editor, one paragraph per line of its text (content-conversion.ts
    -- plainContent). The old tables never held files.
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
          from regexp_split_to_table(x.body, e'\n') with ordinality as l(line, ord)), '[]'::jsonb))),
      x.body, x.created_at, x.author_user_id, x.created_at
    from core.messages x
    join core.message_threads h on h.tenant_id = x.tenant_id and h.id = x.thread_id
    where x.tenant_id = t and x.kind <> 'event' and x.body <> ''
      and x.thread_id in (select thread_id from contract_threads where tenant_id = t)
      and not exists (select 1 from core.documents d
        where d.tenant_id = x.tenant_id and d.host_type = 'message' and d.host_id = x.id);
  end loop;
end $$;

alter table core.messages enable trigger row_meta;
