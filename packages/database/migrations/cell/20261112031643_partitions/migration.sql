create table audit.log (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor_kind text not null default coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system'),
  actor_user_id uuid default app.user_id(),
  session_id uuid default nullif(current_setting('app.session_id', true), '')::uuid,
  action text not null,
  outcome text not null default 'success',
  object_type text not null,
  object_id uuid,
  org_id uuid,
  subject_user_id uuid,
  student_user_id uuid,
  request_id text default nullif(current_setting('app.request_id', true), ''),
  details jsonb not null default '{}',
  payload_digest bytea,
  row_hash bytea not null,
  constraint log_pkey primary key (tenant_id, occurred_at, id),
  constraint log_tenant_id_fkey foreign key (tenant_id) references core.tenants (tenant_id),
  constraint log_actor_kind_check check (actor_kind in ('user', 'system', 'integration', 'import', 'operator')),
  constraint log_action_check check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint log_outcome_check check (outcome in ('success', 'denied', 'failed')),
  constraint log_object_type_check check (object_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint log_request_id_check check (char_length(request_id) between 1 and 64),
  constraint log_details_check check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192),
  constraint log_payload_digest_check check (octet_length(payload_digest) = 32)
) partition by range (occurred_at);
create index log_object_idx on audit.log (tenant_id, object_type, object_id, occurred_at);
create index log_subject_idx on audit.log (tenant_id, subject_user_id, occurred_at) where subject_user_id is not null;
create index log_student_idx on audit.log (tenant_id, student_user_id, occurred_at) where student_user_id is not null;
create index log_actor_idx on audit.log (tenant_id, actor_user_id, occurred_at);
create index log_request_idx on audit.log (tenant_id, request_id) where request_id is not null;

alter table audit.log enable row level security;
create policy tenant_isolation on audit.log as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on audit.log for all to cell_owner using (true) with check (true);
create policy p_select on audit.log for select to app, worker, cell_io, retention using (true);
create policy p_insert on audit.log for insert to app, worker, cell_io with check (true);
create policy p_integration_insert on audit.log for insert to integration with check (true);

create table audit.payloads (
  tenant_id uuid not null,
  event_id uuid not null,
  occurred_at timestamptz not null,
  subject_user_id uuid,
  salt bytea not null,
  before jsonb,
  after jsonb,
  constraint payloads_pkey primary key (tenant_id, occurred_at, event_id),
  constraint payloads_tenant_id_occurred_at_event_id_fkey foreign key (tenant_id, occurred_at, event_id)
    references audit.log (tenant_id, occurred_at, id),
  constraint payloads_salt_check check (octet_length(salt) = 16)
) partition by range (occurred_at);
create index payloads_subject_idx on audit.payloads (tenant_id, subject_user_id) where subject_user_id is not null;

alter table audit.payloads enable row level security;
create policy tenant_isolation on audit.payloads as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on audit.payloads for all to cell_owner using (true) with check (true);
create policy p_select on audit.payloads for select to app, worker, cell_io, retention using (true);
create policy p_insert on audit.payloads for insert to app, worker, cell_io with check (true);
create policy p_erase_delete on audit.payloads for delete to retention
  using (app.erasure_approved(tenant_id, subject_user_id));

create table core.attendance_events (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  taken_on date not null,
  register_id uuid not null,
  student_user_id uuid not null,
  category_descriptor_id uuid not null,
  category_ns text not null default 'attendance_category',
  category_meaning text not null,
  reason_descriptor_id uuid,
  reason_ns text not null default 'attendance_reason',
  minutes smallint,
  note text,
  recorded_by_user_id uuid not null,
  status text not null default 'active',
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default statement_timestamp(),
  constraint attendance_events_pkey primary key (tenant_id, taken_on, id),
  constraint attendance_events_tenant_id_fkey foreign key (tenant_id) references core.tenants (tenant_id),
  constraint attendance_events_tenant_id_register_id_taken_on_fkey foreign key (tenant_id, register_id, taken_on)
    references core.attendance_registers (tenant_id, id, taken_on),
  constraint attendance_events_tenant_id_student_user_id_fkey foreign key (tenant_id, student_user_id)
    references core.users (tenant_id, id),
  constraint attendance_events_tenant_id_recorded_by_user_id_fkey foreign key (tenant_id, recorded_by_user_id)
    references core.users (tenant_id, id),
  constraint attendance_events_tenant_id_category_descriptor_id_categor_fkey
    foreign key (tenant_id, category_descriptor_id, category_ns, category_meaning)
    references core.descriptors (tenant_id, id, namespace, system_meaning),
  constraint attendance_events_tenant_id_reason_descriptor_id_reason_ns_fkey
    foreign key (tenant_id, reason_descriptor_id, reason_ns) references core.descriptors (tenant_id, id, namespace),
  constraint attendance_events_category_ns_check check (category_ns = 'attendance_category'),
  constraint attendance_events_category_meaning_check
    check (category_meaning in ('present', 'absent', 'late', 'excused', 'left_early')),
  constraint attendance_events_reason_ns_check check (reason_ns = 'attendance_reason'),
  constraint attendance_events_minutes_check check (minutes between 1 and 600),
  constraint attendance_events_minutes_timed_check
    check (minutes is null or category_meaning in ('late', 'left_early')),
  constraint attendance_events_note_check check (char_length(note) between 1 and 500),
  constraint attendance_events_status_check check (status in ('active', 'tobedeleted')),
  constraint attendance_events_version_check check (version > 0),
  constraint attendance_events_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
) partition by range (taken_on);
create unique index attendance_events_key on core.attendance_events (tenant_id, taken_on, register_id, student_user_id)
  where status = 'active';
create index attendance_events_student_idx on core.attendance_events (tenant_id, student_user_id, taken_on)
  where status = 'active';
create index attendance_events_unexplained_idx on core.attendance_events (tenant_id, taken_on)
  where status = 'active' and reason_descriptor_id is null and category_meaning in ('absent', 'late');

alter table core.attendance_events enable row level security;
create policy tenant_isolation on core.attendance_events as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.attendance_events for all to cell_owner using (true) with check (true);
create policy p_select on core.attendance_events for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.attendance_events for insert to app, worker, cell_io with check (true);
create policy p_update on core.attendance_events for update to app, worker, cell_io using (true) with check (true);

create table core.notifications (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  created_at timestamptz not null default statement_timestamp(),
  user_id uuid not null,
  org_id uuid not null,
  kind text not null,
  subject_type text not null,
  subject_id uuid not null,
  actor_user_id uuid,
  params jsonb not null default '{}',
  needs_action boolean not null default false,
  read_at timestamptz,
  acted_at timestamptz,
  status text not null default 'active',
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  metadata jsonb not null default '{}',
  constraint notifications_pkey primary key (tenant_id, created_at, id),
  constraint notifications_tenant_id_fkey foreign key (tenant_id) references core.tenants (tenant_id),
  constraint notifications_tenant_id_user_id_fkey foreign key (tenant_id, user_id)
    references core.users (tenant_id, id),
  constraint notifications_tenant_id_org_id_fkey foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  constraint notifications_tenant_id_actor_user_id_fkey foreign key (tenant_id, actor_user_id)
    references core.users (tenant_id, id),
  constraint notifications_kind_check check (kind in ('announcement', 'urgent', 'message', 'absence', 'event',
    'reminder', 'consent', 'mention', 'library', 'reply', 'enquiry', 'application', 'correction', 'assignment',
    'feedback', 'grades', 'reenrolment', 'admission_event', 'peer_review')),
  constraint notifications_subject_type_check check (subject_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint notifications_params_check
    check (jsonb_typeof(params) = 'object' and octet_length(params::text) <= 4096),
  constraint notifications_acted_check check (acted_at is null or needs_action),
  constraint notifications_status_check check (status in ('active', 'tobedeleted')),
  constraint notifications_version_check check (version > 0),
  constraint notifications_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
) partition by range (created_at);
create index notifications_user_idx on core.notifications (tenant_id, user_id, created_at desc)
  where status = 'active';
create index notifications_unread_idx on core.notifications (tenant_id, user_id)
  where status = 'active' and read_at is null;
create index notifications_subject_idx on core.notifications (tenant_id, subject_type, subject_id)
  where status = 'active';

alter table core.notifications enable row level security;
create policy tenant_isolation on core.notifications as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.notifications for all to cell_owner using (true) with check (true);
create policy p_select on core.notifications for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.notifications for insert to app, worker, cell_io with check (true);
create policy p_update on core.notifications for update to app, worker, cell_io using (true) with check (true);

-- A delivery tells a person about a notification, carries one message of a
-- conversation to an outside contact, or records a sign-in link the school
-- sent at once, inside the request. The link's secret is never kept here.
create table core.notification_deliveries (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  created_at timestamptz not null default statement_timestamp(),
  notification_id uuid,
  notification_created_at timestamptz,
  user_id uuid,
  contact_id uuid,
  message_id uuid,
  link_purpose text,
  org_id uuid,
  channel text not null,
  address text,
  locale text not null,
  state text not null,
  reason text,
  due_at timestamptz not null,
  attempts smallint not null default 0,
  last_error text,
  receipt text,
  sent_at timestamptz,
  status text not null default 'active',
  date_last_modified timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  metadata jsonb not null default '{}',
  constraint notification_deliveries_pkey primary key (tenant_id, created_at, id),
  constraint notification_deliveries_tenant_id_fkey foreign key (tenant_id) references core.tenants (tenant_id),
  constraint notification_deliveries_tenant_id_notification_created_at__fkey
    foreign key (tenant_id, notification_created_at, notification_id)
    references core.notifications (tenant_id, created_at, id),
  constraint notification_deliveries_tenant_id_user_id_fkey foreign key (tenant_id, user_id)
    references core.users (tenant_id, id),
  constraint notification_deliveries_tenant_id_contact_id_fkey foreign key (tenant_id, contact_id)
    references core.message_contacts (tenant_id, id),
  constraint notification_deliveries_tenant_id_message_id_fkey foreign key (tenant_id, message_id)
    references core.messages (tenant_id, id),
  constraint notification_deliveries_tenant_id_org_id_fkey foreign key (tenant_id, org_id)
    references core.orgs (tenant_id, id),
  constraint notification_deliveries_recipient_check check (
    (user_id is not null and notification_id is not null and notification_created_at is not null
      and contact_id is null and message_id is null and link_purpose is null and org_id is null)
    or (user_id is null and notification_id is null and notification_created_at is null
      and contact_id is not null and message_id is not null and link_purpose is null and org_id is null)
    or (user_id is not null and link_purpose is not null and org_id is not null
      and notification_id is null and notification_created_at is null
      and contact_id is null and message_id is null)),
  constraint notification_deliveries_link_purpose_check check (link_purpose in ('invite', 'reset', 'register')),
  constraint notification_deliveries_link_state_check check (link_purpose is null or state in ('sent', 'failed')),
  constraint notification_deliveries_channel_check check (channel in ('email', 'sms')),
  constraint notification_deliveries_locale_check check (locale in ('ar', 'en')),
  constraint notification_deliveries_state_check check (state in ('pending', 'sent', 'failed', 'skipped')),
  constraint notification_deliveries_reason_check
    check (reason is null or reason in ('preference_off', 'no_address', 'unreachable', 'no_provider',
      'withdrawn', 'provider_error', 'gave_up', 'module_off')),
  constraint notification_deliveries_reason_state_check check ((state in ('skipped', 'failed')) = (reason is not null)),
  constraint notification_deliveries_address_check check (address is null or char_length(address) between 3 and 320),
  constraint notification_deliveries_attempts_check check (attempts between 0 and 20),
  constraint notification_deliveries_error_check check (last_error is null or char_length(last_error) <= 500),
  constraint notification_deliveries_sent_check check ((state = 'sent') = (sent_at is not null)),
  constraint notification_deliveries_status_check check (status in ('active', 'tobedeleted')),
  constraint notification_deliveries_version_check check (version > 0),
  constraint notification_deliveries_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
) partition by range (created_at);
create index notification_deliveries_due_idx on core.notification_deliveries (tenant_id, due_at)
  where state = 'pending' and status = 'active';
create index notification_deliveries_notification_idx
  on core.notification_deliveries (tenant_id, notification_id);
create index notification_deliveries_message_idx on core.notification_deliveries (tenant_id, message_id)
  where message_id is not null;
create index notification_deliveries_recent_idx on core.notification_deliveries (tenant_id, created_at desc);

alter table core.notification_deliveries enable row level security;
create policy tenant_isolation on core.notification_deliveries as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.notification_deliveries for all to cell_owner using (true) with check (true);
create policy p_select on core.notification_deliveries for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.notification_deliveries for insert to app, worker, cell_io with check (true);
create policy p_update on core.notification_deliveries for update to app, worker, cell_io using (true) with check (true);
-- Mail sent to a contact before it was merged keeps naming it, so erasing
-- the contact it was merged into empties those addresses too.
create policy p_erase_update on core.notification_deliveries for update to retention
  using (app.erasure_approved(tenant_id, contact_id)
    or exists (select 1 from core.message_contacts c where c.tenant_id = notification_deliveries.tenant_id
      and c.id = notification_deliveries.contact_id
      and (app.erasure_approved(c.tenant_id, c.user_id)
        or app.erasure_approved(c.tenant_id, c.merged_into_id))))
  with check (address is null);

insert into ops.partitioned_tables (schema_name, table_name, period) values
  ('audit', 'log', 'month'),
  ('audit', 'payloads', 'month'),
  ('core', 'attendance_events', 'year'),
  ('core', 'notifications', 'month'),
  ('core', 'notification_deliveries', 'month');

-- Partition bounds are UTC midnights; a date key reads them in the session's
-- zone.
set local timezone = 'UTC';
select app.ensure_partitions(12);
