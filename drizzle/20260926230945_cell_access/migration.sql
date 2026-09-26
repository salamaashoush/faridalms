-- What the generated migration cannot express: deferrable and PERIOD keys,
-- WITHOUT OVERLAPS and NULLS NOT DISTINCT uniqueness, exclusion constraints,
-- partitioned tables, the search index, views, functions, triggers, forced
-- row level security and every grant of the access profiles.

-- Keys and uniqueness

alter table core.tenants add foreign key (tenant_id, root_org_id)
  references core.orgs (tenant_id, id) deferrable initially deferred;

create unique index descriptors_code_key on core.descriptors (tenant_id, namespace, org_id, code_value)
  nulls not distinct where status = 'active';

alter table core.academic_sessions add unique (tenant_id, id, span without overlaps);
alter table core.academic_sessions add unique (tenant_id, id, type, span without overlaps);
alter table core.academic_sessions add foreign key (tenant_id, parent_id, parent_type, period span)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.academic_sessions add constraint academic_sessions_year_excl exclude using gist
  (tenant_id with =, org_id with =, span with &&) where (type = 'school_year' and status = 'active');
alter table core.academic_sessions add constraint academic_sessions_sibling_excl exclude using gist
  (tenant_id with =, parent_id with =, type with =, span with &&) where (parent_id is not null and status = 'active');

alter table core.calendar_dates add foreign key (tenant_id, school_year_id, school_year_type, period span)
  references core.academic_sessions (tenant_id, id, type, period span);

alter table core.academic_weeks add foreign key (tenant_id, school_year_id, school_year_type, period span)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.academic_weeks add constraint academic_weeks_excl exclude using gist
  (tenant_id with =, school_year_id with =, span with &&) where (status = 'active');

alter table core.class_periods add foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.class_periods add constraint class_periods_code_excl exclude using gist
  (tenant_id with =, org_id with =, school_year_id with =, code with =, valid_during with &&)
  where (status = 'active');
alter table core.class_periods add constraint class_periods_sequence_excl exclude using gist
  (tenant_id with =, org_id with =, school_year_id with =, sequence with =, valid_during with &&)
  where (status = 'active');

create unique index external_ids_identifier_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier) nulls not distinct
  where status = 'active' and identifier is not null;
create unique index external_ids_hmac_key on core.external_ids
  (tenant_id, system_descriptor_id, assigning_org_id, identifier_hmac) nulls not distinct
  where status = 'active' and identifier_hmac is not null;

alter table core.household_members add constraint household_members_excl exclude using gist
  (tenant_id with =, household_id with =, user_id with =, valid_during with &&) where (status = 'active');

alter table core.student_school_years add foreign key (tenant_id, school_year_id, school_year_type, period valid_during)
  references core.academic_sessions (tenant_id, id, type, period span);
alter table core.student_school_years add constraint student_school_years_excl exclude using gist
  (tenant_id with =, student_user_id with =, org_id with =, valid_during with &&) where (status = 'active');

alter table core.user_roles add constraint user_roles_role_excl exclude using gist
  (tenant_id with =, user_id with =, org_id with =, role with =, valid_during with &&) where (status = 'active');

alter table core.user_relationships add constraint user_relationships_excl exclude using gist
  (tenant_id with =, student_user_id with =, related_user_id with =, valid_during with &&) where (status = 'active');

create unique index access_roles_builtin_key on core.access_roles (tenant_id, org_id, builtin_key)
  nulls not distinct where status = 'active' and builtin_key is not null;

alter table core.access_role_assignments add constraint access_role_assignments_excl exclude using gist
  (tenant_id with =, user_id with =, access_role_id with =, org_id with =, valid_during with &&)
  where (status = 'active');

-- Partitioned tables

create table audit.log (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor_kind text not null default coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system')
    check (actor_kind in ('user', 'system', 'integration', 'import', 'operator')),
  actor_user_id uuid default app.user_id(),
  session_id uuid default nullif(current_setting('app.session_id', true), '')::uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'failed')),
  object_type text not null check (object_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  object_id uuid,
  org_id uuid,
  subject_user_id uuid,
  student_user_id uuid,
  request_id text default nullif(current_setting('app.request_id', true), '')
    check (char_length(request_id) between 1 and 64),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192),
  payload_digest bytea check (octet_length(payload_digest) = 32),
  row_hash bytea not null,
  primary key (tenant_id, occurred_at, id),
  foreign key (tenant_id) references core.tenants (tenant_id)
) partition by range (occurred_at);
create index log_object_idx on audit.log (tenant_id, object_type, object_id, occurred_at);
create index log_subject_idx on audit.log (tenant_id, subject_user_id, occurred_at) where subject_user_id is not null;
create index log_student_idx on audit.log (tenant_id, student_user_id, occurred_at) where student_user_id is not null;
create index log_actor_idx on audit.log (tenant_id, actor_user_id, occurred_at);
create index log_request_idx on audit.log (tenant_id, request_id) where request_id is not null;

create table audit.payloads (
  tenant_id uuid not null,
  event_id uuid not null,
  occurred_at timestamptz not null,
  subject_user_id uuid,
  salt bytea not null check (octet_length(salt) = 16),
  before jsonb,
  after jsonb,
  primary key (tenant_id, occurred_at, event_id),
  foreign key (tenant_id, occurred_at, event_id) references audit.log (tenant_id, occurred_at, id)
) partition by range (occurred_at);
create index payloads_subject_idx on audit.payloads (tenant_id, subject_user_id) where subject_user_id is not null;

create table core.activity_events (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor_user_id uuid not null,
  verb text not null check (verb ~ '^[a-z][a-z_]{1,40}$'),
  object_type text not null check (object_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  object_id uuid not null,
  org_id uuid,
  context_type text check (context_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  context_id uuid,
  session_id uuid,
  result jsonb check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4096),
  primary key (tenant_id, occurred_at, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  constraint activity_events_context_check check ((context_type is null) = (context_id is null))
) partition by range (occurred_at);
create index activity_events_actor_idx on core.activity_events (tenant_id, actor_user_id, occurred_at);
create index activity_events_object_idx on core.activity_events (tenant_id, object_type, object_id, occurred_at);

alter table audit.log enable row level security;
alter table audit.payloads enable row level security;
alter table core.activity_events enable row level security;

create policy tenant_isolation on audit.log as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on audit.log for all to cell_owner using (true) with check (true);
create policy p_select on audit.log for select to app, worker, cell_io, retention using (true);
create policy p_insert on audit.log for insert to app, worker, cell_io with check (true);
create policy p_integration_insert on audit.log for insert to integration with check (true);

create policy tenant_isolation on audit.payloads as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on audit.payloads for all to cell_owner using (true) with check (true);
create policy p_select on audit.payloads for select to app, worker, cell_io, retention using (true);
create policy p_insert on audit.payloads for insert to app, worker, cell_io with check (true);
create policy p_erase_delete on audit.payloads for delete to retention
  using (app.erasure_approved(tenant_id, subject_user_id));

create policy tenant_isolation on core.activity_events as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.activity_events for all to cell_owner using (true) with check (true);
create policy p_select on core.activity_events for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.activity_events for insert to app, worker, cell_io with check (true);
create policy p_erase_delete on core.activity_events for delete to retention
  using (app.erasure_approved(tenant_id, actor_user_id));

-- Audit functions and triggers

create function audit.hash_row() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user <> 'cell_io' then
    new.occurred_at := statement_timestamp();
    new.actor_kind := coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system');
    new.actor_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
    new.session_id := nullif(current_setting('app.session_id', true), '')::uuid;
    new.request_id := nullif(current_setting('app.request_id', true), '');
  end if;
  new.row_hash := sha256(convert_to(jsonb_build_array(
    new.tenant_id, new.id, (extract(epoch from new.occurred_at) * 1000000)::bigint,
    new.actor_kind, new.actor_user_id, new.session_id, new.action, new.outcome,
    new.object_type, new.object_id, new.org_id, new.subject_user_id, new.student_user_id, new.request_id,
    new.details, encode(new.payload_digest, 'hex'))::text, 'UTF8'));
  return new;
end $$;
create trigger hash_row before insert on audit.log for each row execute function audit.hash_row();

create function audit.check_payload() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  digest bytea;
begin
  select l.payload_digest into digest from audit.log l
  where l.tenant_id = new.tenant_id and l.occurred_at = new.occurred_at and l.id = new.event_id
    and (current_user = 'cell_io' or l.occurred_at >= transaction_timestamp());
  if digest is null
     or digest <> sha256(new.salt || convert_to(jsonb_build_array(new.before, new.after)::text, 'UTF8')) then
    raise exception 'payload does not match its audit row' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger check_payload before insert on audit.payloads for each row execute function audit.check_payload();

create function audit.refuse_change() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception '% on %.% is not allowed', tg_op, tg_table_schema, tg_table_name using errcode = '42501';
end $$;
create trigger refuse_update_delete before update or delete on audit.log
  for each row execute function audit.refuse_change();
create trigger refuse_truncate before truncate on audit.log
  for each statement execute function audit.refuse_change();
create trigger refuse_update before update on audit.payloads
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before update or delete on audit.seal_batches
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before update or delete on audit.seal_members
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before update or delete on audit.anchors
  for each row execute function audit.refuse_change();

-- Context functions that read tables

create function app.tenant_lifecycle() returns text
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select lifecycle from ops.tenant_registry where tenant_id = app.tenant_id() $$;

create function app.begin_unit(p_tenant uuid, p_user uuid, p_account uuid, p_session uuid,
  p_request text, p_actor text) returns text
language plpgsql volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  perform set_config('app.tenant_id', p_tenant::text, true),
          set_config('app.tenant_txn', ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text, true),
          set_config('app.user_id', coalesce(p_user::text, ''), true),
          set_config('app.account_id', coalesce(p_account::text, ''), true),
          set_config('app.session_id', coalesce(p_session::text, ''), true),
          set_config('app.request_id', coalesce(p_request, ''), true),
          set_config('app.actor_kind', coalesce(p_actor, 'system'), true),
          set_config('app.purpose', '', true);
  return app.tenant_lifecycle();
end $$;

-- Changing a school year's dates

create function app.change_year_span(p_year_id uuid, p_span daterange, p_expected_version integer)
returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  y record;
  removed integer;
begin
  perform app.lock('year:' || p_year_id::text);
  select s.tenant_id, s.id, s.org_id, s.span, s.lifecycle, s.version into y
  from core.academic_sessions s
  where s.tenant_id = app.tenant_id() and s.id = p_year_id and s.type = 'school_year' and s.status = 'active'
  for update;
  if not found then
    raise exception 'school year % not found', p_year_id using errcode = 'P0002';
  end if;
  if y.version <> p_expected_version then
    raise exception 'school year % has changed', p_year_id using errcode = 'F0412';
  end if;
  if y.lifecycle = 'closed' then
    raise exception 'school year % is closed', p_year_id using errcode = '55000';
  end if;
  if exists (select 1 from core.academic_sessions s where s.tenant_id = y.tenant_id
               and s.school_year_id = y.id and s.id <> y.id and s.status = 'active' and not p_span @> s.span)
     or exists (select 1 from core.academic_weeks w where w.tenant_id = y.tenant_id
               and w.school_year_id = y.id and w.status = 'active' and not p_span @> w.span)
     or exists (select 1 from core.class_periods p where p.tenant_id = y.tenant_id
               and p.school_year_id = y.id and p.status = 'active' and not p_span @> p.valid_during)
     or exists (select 1 from core.student_school_years r where r.tenant_id = y.tenant_id
               and r.school_year_id = y.id and r.status = 'active' and not p_span @> r.valid_during) then
    raise exception 'active rows of school year % fall outside %', p_year_id, p_span using errcode = '23514';
  end if;
  delete from core.calendar_dates d
  where d.tenant_id = y.tenant_id and d.school_year_id = y.id and not p_span @> d.day_on;
  get diagnostics removed = row_count;
  delete from core.academic_weeks w
  where w.tenant_id = y.tenant_id and w.school_year_id = y.id and w.status = 'tobedeleted' and not p_span @> w.span;
  delete from core.class_periods p
  where p.tenant_id = y.tenant_id and p.school_year_id = y.id and p.status = 'tobedeleted'
    and not p_span @> p.valid_during;
  delete from core.student_school_years r
  where r.tenant_id = y.tenant_id and r.school_year_id = y.id and r.status = 'tobedeleted'
    and not p_span @> r.valid_during;
  delete from core.academic_sessions s
  where s.tenant_id = y.tenant_id and s.school_year_id = y.id and s.id <> y.id and s.status = 'tobedeleted'
    and not p_span @> s.span;
  update core.academic_sessions set span = p_span where tenant_id = y.tenant_id and id = y.id;
  insert into audit.log (tenant_id, action, object_type, object_id, org_id, details)
  values (y.tenant_id, 'academic_session.span_change', 'academic_session', y.id, y.org_id,
          jsonb_build_object('from', y.span::text, 'to', p_span::text, 'removed_calendar_dates', removed));
  return removed;
end $$;

-- Documents

create function app.documents_frozen_guard() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.host_type is distinct from old.host_type or new.host_id is distinct from old.host_id then
    raise exception 'document host is immutable' using errcode = '55000';
  end if;
  if old.frozen_at is not null and current_user <> 'retention' and (new.content is distinct from old.content
      or new.ydoc is distinct from old.ydoc or new.plain_text is distinct from old.plain_text
      or new.frozen_at is distinct from old.frozen_at) then
    raise exception 'document % is frozen', old.id using errcode = '55000';
  end if;
  return new;
end $$;
create trigger documents_frozen_guard before update on core.documents
  for each row execute function app.documents_frozen_guard();

create view core.current_consents with (security_invoker = true) as
select distinct on (tenant_id, subject_user_id, purpose_descriptor_id) *
from core.consent_records
order by tenant_id, subject_user_id, purpose_descriptor_id, created_at desc, id desc;

-- Search

create table search.entries (
  tenant_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  result_type text not null,
  result_id uuid not null,
  org_ids uuid[] not null default '{}',
  name_norm text,
  text_vector tsvector,
  primary key (tenant_id, entity_type, entity_id)
);
create index entries_name_idx on search.entries using gin (tenant_id, name_norm ext.gin_trgm_ops);
create index entries_text_idx on search.entries using gin (tenant_id, text_vector);
create index entries_org_idx on search.entries using gin (tenant_id, org_ids);

create function app.normalize_name(t text) returns text
language sql immutable parallel safe strict
set search_path = pg_catalog, pg_temp
as $$
  select lower(translate(
    regexp_replace(t, '[ً-ٰٟـ]', '', 'g'),
    'أإآىة', 'ااايه'))
$$;

create function app.search(q text, types text[], org_scope uuid[] default null,
  after_rank real default null, after_id uuid default null, max_rows integer default 50)
returns table (result_type text, result_id uuid, rank real)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with query as (
    select app.normalize_name(q) as norm,
           websearch_to_tsquery('arabic', q) as ar,
           websearch_to_tsquery('english', q) as en
  ), hits as (
    select e.result_type, e.result_id,
           greatest(coalesce(ext.word_similarity(query.norm, e.name_norm), 0),
                    coalesce(ts_rank(e.text_vector, query.ar || query.en), 0))::real as rank
    from search.entries e, query
    where e.tenant_id = app.tenant_id()
      and e.result_type = any (types)
      and (org_scope is null or cardinality(e.org_ids) = 0 or e.org_ids && org_scope)
      and (query.norm operator(ext.<%) e.name_norm
           or e.text_vector @@ query.ar
           or e.text_vector @@ query.en)
  ), best as (
    select h.result_type, h.result_id, max(h.rank) as rank
    from hits h group by h.result_type, h.result_id
  )
  select b.result_type, b.result_id, b.rank from best b
  where after_rank is null or (b.rank, b.result_id) < (after_rank, after_id)
  order by b.rank desc, b.result_id desc
  limit least(max_rows, 200)
$$;

create function app.index_user() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' or new.erased_at is not null then
    delete from search.entries where tenant_id = new.tenant_id and entity_type = 'user' and entity_id = new.id;
    return new;
  end if;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, name_norm)
  values (new.tenant_id, 'user', new.id, 'user', new.id,
          app.normalize_name(concat_ws(' ', new.full_name_ar, new.full_name_en,
                                       new.preferred_given_name, new.preferred_family_name)))
  on conflict (tenant_id, entity_type, entity_id) do update set name_norm = excluded.name_norm;
  return new;
end $$;
create trigger index_user after insert or update of full_name_ar, full_name_en, preferred_given_name,
  preferred_family_name, status, erased_at on core.users for each row execute function app.index_user();

create function app.index_user_orgs() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update search.entries e set org_ids = coalesce((
    select array_agg(distinct r.org_id order by r.org_id) from core.user_roles r
    where r.tenant_id = new.tenant_id and r.user_id = new.user_id and r.status = 'active'
      and (upper_inf(r.valid_during)
           or upper(r.valid_during) > (statement_timestamp() at time zone 'UTC')::date)), '{}')
  where e.tenant_id = new.tenant_id and e.entity_type = 'user' and e.entity_id = new.user_id;
  return new;
end $$;
create trigger index_user_orgs after insert or update of org_id, status, valid_during on core.user_roles
  for each row execute function app.index_user_orgs();

create function app.index_document() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status <> 'active' then
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
create trigger index_document after insert or update of plain_text, status, org_id on core.documents
  for each row execute function app.index_document();

create function app.index_translation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  d record;
begin
  if new.status <> 'active' then
    delete from search.entries
    where tenant_id = new.tenant_id and entity_type = 'document_translation' and entity_id = new.id;
    return new;
  end if;
  select host_type, host_id, org_id into d from core.documents
  where tenant_id = new.tenant_id and id = new.document_id;
  insert into search.entries (tenant_id, entity_type, entity_id, result_type, result_id, org_ids, text_vector)
  values (new.tenant_id, 'document_translation', new.id, d.host_type, d.host_id,
          case when d.org_id is null then '{}'::uuid[] else array[d.org_id] end,
          to_tsvector((case new.target_locale when 'ar' then 'arabic' else 'english' end)::regconfig,
                      left(new.plain_text, 200000)))
  on conflict (tenant_id, entity_type, entity_id)
    do update set text_vector = excluded.text_vector, org_ids = excluded.org_ids;
  return new;
end $$;
create trigger index_translation after insert or update of plain_text, status on core.document_translations
  for each row execute function app.index_translation();

-- Partitions

insert into ops.partitioned_tables (schema_name, table_name, period)
values ('core', 'activity_events', 'month'), ('audit', 'log', 'month'), ('audit', 'payloads', 'month');

create function app.ensure_partitions(months_ahead integer default 3, since date default null) returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  parent record;
  step interval;
  m date;
  last_start date;
  made integer := 0;
  part text;
begin
  for parent in select schema_name, table_name, period from ops.partitioned_tables loop
    step := case parent.period when 'month' then interval '1 month' else interval '1 year' end;
    m := date_trunc(parent.period,
           coalesce(since, (statement_timestamp() at time zone 'UTC')::date)::timestamp)::date;
    last_start := date_trunc(parent.period,
           (statement_timestamp() at time zone 'UTC') + make_interval(months => months_ahead))::date;
    while m <= last_start loop
      part := format('%s_%s_%s', parent.schema_name, parent.table_name,
                     to_char(m, case parent.period when 'month' then 'YYYY_MM' else 'YYYY' end));
      if to_regclass(format('parts.%I', part)) is null then
        execute format('create table parts.%I partition of %I.%I for values from (%L) to (%L)',
          part, parent.schema_name, parent.table_name,
          m::timestamp at time zone 'UTC', (m + step)::timestamp at time zone 'UTC');
        made := made + 1;
      end if;
      m := (m + step)::date;
    end loop;
  end loop;
  return made;
end $$;

select app.ensure_partitions(3);

-- Row metadata triggers

create trigger row_meta before insert or update on core.orgs for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.org_features for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.descriptors for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.descriptor_overrides for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.academic_sessions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendars for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_grade_levels for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_dates for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.academic_weeks for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_periods for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.locations for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.files for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.file_publications for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.file_subjects for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.users for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.external_ids for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.households for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.household_members for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.contact_points for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.student_school_years for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.user_roles for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.user_relationships for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.accounts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.identity_providers for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.identity_provider_orgs for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.login_identities for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.passkeys for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.devices for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.access_roles for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.access_role_assignments for each row execute function app.row_meta();
create trigger row_meta before insert or update on health.records for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.documents for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_translations for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_files for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_links for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.privacy_notices for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.legal_holds for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.import_runs for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.user_preferences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.saved_views for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.tenants
  for each row execute function app.row_meta_keyed('tenant_id');
create trigger row_meta before insert or update on core.demographics
  for each row execute function app.row_meta_keyed('user_id');
create trigger row_meta before insert or update on core.relationship_restrictions
  for each row execute function app.row_meta_keyed('relationship_id');

-- Forced row level security

alter table core.tenants force row level security;
alter table core.orgs force row level security;
alter table core.org_features force row level security;
alter table core.descriptors force row level security;
alter table core.descriptor_overrides force row level security;
alter table core.academic_sessions force row level security;
alter table core.calendars force row level security;
alter table core.calendar_grade_levels force row level security;
alter table core.calendar_dates force row level security;
alter table core.academic_weeks force row level security;
alter table core.class_periods force row level security;
alter table core.locations force row level security;
alter table core.files force row level security;
alter table core.file_publications force row level security;
alter table core.file_subjects force row level security;
alter table core.tenant_keys force row level security;
alter table core.users force row level security;
alter table core.demographics force row level security;
alter table core.external_ids force row level security;
alter table core.households force row level security;
alter table core.household_members force row level security;
alter table core.contact_points force row level security;
alter table core.student_school_years force row level security;
alter table core.user_roles force row level security;
alter table core.user_relationships force row level security;
alter table core.relationship_restrictions force row level security;
alter table core.accounts force row level security;
alter table core.identity_providers force row level security;
alter table core.identity_provider_orgs force row level security;
alter table core.login_identities force row level security;
alter table core.passkeys force row level security;
alter table core.devices force row level security;
alter table core.sessions force row level security;
alter table core.auth_attempts force row level security;
alter table core.access_roles force row level security;
alter table core.access_role_assignments force row level security;
alter table health.records force row level security;
alter table core.documents force row level security;
alter table core.document_versions force row level security;
alter table core.document_translations force row level security;
alter table core.document_files force row level security;
alter table core.document_links force row level security;
alter table core.privacy_notices force row level security;
alter table core.consent_records force row level security;
alter table core.erasure_approvals force row level security;
alter table core.erasure_items force row level security;
alter table core.legal_holds force row level security;
alter table core.activity_events force row level security;
alter table core.idempotency_keys force row level security;
alter table core.import_runs force row level security;
alter table core.import_rows force row level security;
alter table core.user_preferences force row level security;
alter table core.saved_views force row level security;
alter table audit.log force row level security;
alter table audit.payloads force row level security;
alter table audit.seal_batches force row level security;
alter table audit.seal_members force row level security;
alter table audit.anchors force row level security;

-- Grants: entity profile

grant select, insert, update on
  core.org_features, core.descriptor_overrides, core.academic_sessions, core.calendars,
  core.calendar_grade_levels, core.calendar_dates, core.academic_weeks, core.class_periods, core.locations,
  core.file_publications, core.file_subjects, core.users, core.demographics, core.external_ids,
  core.households, core.household_members, core.contact_points, core.student_school_years, core.user_roles,
  core.user_relationships, core.relationship_restrictions, core.identity_providers, core.identity_provider_orgs,
  core.login_identities, core.devices, core.access_role_assignments, health.records, core.documents,
  core.document_translations, core.document_files, core.document_links, core.privacy_notices, core.legal_holds,
  core.import_runs, core.user_preferences, core.saved_views
  to app, worker, cell_io;
grant select on
  core.org_features, core.descriptor_overrides, core.academic_sessions, core.calendars,
  core.calendar_grade_levels, core.calendar_dates, core.academic_weeks, core.class_periods, core.locations,
  core.file_publications, core.file_subjects, core.users, core.demographics, core.external_ids,
  core.households, core.household_members, core.contact_points, core.student_school_years, core.user_roles,
  core.user_relationships, core.relationship_restrictions, core.identity_providers, core.identity_provider_orgs,
  core.login_identities, core.devices, core.access_role_assignments, health.records, core.documents,
  core.document_translations, core.document_files, core.document_links, core.privacy_notices, core.legal_holds,
  core.import_runs, core.user_preferences, core.saved_views,
  core.tenants, core.orgs, core.descriptors, core.files, core.accounts, core.passkeys, core.access_roles,
  core.tenant_keys
  to retention;

-- Grants: entity tables whose API updates are limited to named columns

grant select on core.tenants to app;
grant update (name_en, name_ar, default_locale, metadata) on core.tenants to app;
grant select, update on core.tenants to worker;
grant select, insert, update on core.tenants to cell_io;

grant select, insert on core.orgs to app;
grant update (name_en, name_ar, identifier, time_zone, default_locale, week_start, weekend_days, country_code,
  address, phone, email, website_url, logo_file_id, status, metadata) on core.orgs to app;
grant select, insert, update on core.orgs to worker, cell_io;
grant select (tenant_id, id, type, parent_id, name_en, name_ar, time_zone, default_locale, country_code, address,
  phone, email, website_url, logo_file_id, status, lifecycle) on core.orgs to site;

grant select, insert on core.descriptors to app;
grant update (label_en, label_ar, description_en, description_ar, sort_order, color, icon, effective_during,
  status, metadata) on core.descriptors to app;
grant select, insert, update on core.descriptors to worker, cell_io;

grant select, insert on core.files to app;
grant update (host_type, host_id, linked_at, name, status, metadata) on core.files to app;
grant select, insert, update on core.files to worker, cell_io;

grant select, insert on core.accounts to app;
grant update (state, first_authenticated_at, last_authenticated_at, state_changed_at, state_changed_by_user_id,
  state_reason, status, metadata) on core.accounts to app;
grant select, insert, update on core.accounts to worker, cell_io;

grant select, insert on core.passkeys to app;
grant update (sign_count, last_used_at, nickname, revoked_at, revoked_reason, status, metadata)
  on core.passkeys to app;
grant select, insert, update on core.passkeys to worker, cell_io;

grant select, insert on core.access_roles to app;
grant update (name_en, name_ar, description_en, description_ar, capabilities, status, metadata)
  on core.access_roles to app;
grant select, insert, update on core.access_roles to worker, cell_io;

grant select (tenant_id, id, file_id, derivative, public_key, host_type, host_id, status, unpublished_at)
  on core.file_publications to site;

-- Grants: integration read

grant select on
  core.tenants, core.orgs, core.descriptors, core.descriptor_overrides, core.academic_sessions, core.calendars,
  core.calendar_grade_levels, core.calendar_dates, core.academic_weeks, core.class_periods, core.users,
  core.demographics, core.external_ids, core.contact_points, core.student_school_years, core.user_roles,
  core.user_relationships, core.accounts
  to integration;

-- Grants: tenant keys

grant select on core.tenant_keys to app;
grant select, insert, update on core.tenant_keys to worker;
grant select, insert on core.tenant_keys to cell_io;
grant update on core.tenant_keys to retention;

-- Grants: ledgers

grant select, insert on
  core.consent_records, core.erasure_approvals, core.erasure_items, core.document_versions, core.import_rows,
  core.activity_events, audit.log, audit.payloads
  to app, worker, cell_io;
grant select on
  core.consent_records, core.erasure_approvals, core.erasure_items, core.document_versions, core.import_rows,
  core.activity_events, audit.log, audit.payloads
  to retention;
grant insert on audit.log to integration;
grant select, insert on audit.seal_batches, audit.seal_members, audit.anchors to worker, cell_io;
grant select on audit.seal_batches, audit.seal_members, audit.anchors to app, retention;
grant select on core.current_consents to app, worker, cell_io, retention;

-- Grants: ephemeral

grant select, insert, update on core.sessions, core.auth_attempts, core.idempotency_keys to app, worker;
grant select, delete on core.sessions, core.auth_attempts, core.idempotency_keys to retention;

-- Grants: erasure

grant update (status, metadata, username, given_name_ar, middle_name_ar, family_name_ar, full_name_ar,
  given_name_en, middle_name_en, family_name_en, full_name_en, preferred_given_name, preferred_middle_name,
  preferred_family_name, birth_date, birth_date_source, sex_descriptor_id, photo_file_id, preferred_locale,
  primary_org_id, erased_at) on core.users to retention;
grant update (status, metadata, birth_country_code, birth_city, nationality_codes, religion_descriptor_id,
  home_languages) on core.demographics to retention;
grant update (status, metadata) on core.student_school_years, core.user_roles, core.user_relationships,
  core.accounts to retention;
grant update (status, metadata, content, plain_text, ydoc) on core.documents to retention;
grant update (status, metadata, content, plain_text) on core.document_translations to retention;
grant update (content, plain_text, ydoc_snapshot, redacted_at) on core.document_versions to retention;
grant update (status, metadata) on
  core.files, core.file_subjects, core.external_ids, core.households, core.household_members,
  core.contact_points, core.relationship_restrictions, core.login_identities, core.passkeys, core.devices,
  health.records, core.user_preferences, core.saved_views
  to retention;
grant delete on
  core.files, core.file_subjects, core.external_ids, core.households, core.household_members,
  core.contact_points, core.relationship_restrictions, core.login_identities, core.passkeys, core.devices,
  health.records, core.user_preferences, core.saved_views, core.activity_events, audit.payloads
  to retention;

-- Grants: collaboration

grant select, update (ydoc, content, plain_text, last_edited_by_user_id, last_edited_at)
  on core.documents to collab;
grant select, insert on core.document_versions to collab;

-- Grants: operations

grant select on ops.tenant_registry to worker;
grant select, insert, delete on ops.sms_suppressions to worker;

-- Functions

revoke all on all functions in schema app, audit from public;
grant execute on function app.tenant_lifecycle(), app.begin_unit(uuid, uuid, uuid, uuid, text, text)
  to app, site, integration, worker, collab, cell_io, retention;
grant execute on function app.change_year_span(uuid, daterange, integer) to app;
grant execute on function app.search(text, text[], uuid[], real, uuid, integer), app.normalize_name(text)
  to app, worker;
grant execute on function app.ensure_partitions(integer, date) to worker;
