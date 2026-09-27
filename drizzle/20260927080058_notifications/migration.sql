-- Notifications and their delivery ledger, both partitioned by month on the
-- moment they were created, with row triggers, forced row level security and
-- the grants of the access profiles.

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
  primary key (tenant_id, created_at, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  foreign key (tenant_id, org_id) references core.orgs (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references core.users (tenant_id, id),
  constraint notifications_kind_check
    check (kind in ('announcement', 'urgent', 'newsletter', 'message', 'absence', 'event', 'reminder')),
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

create table core.notification_deliveries (
  tenant_id uuid not null,
  id uuid not null default uuidv7(),
  created_at timestamptz not null default statement_timestamp(),
  notification_id uuid not null,
  notification_created_at timestamptz not null,
  user_id uuid not null,
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
  primary key (tenant_id, created_at, id),
  foreign key (tenant_id) references core.tenants (tenant_id),
  foreign key (tenant_id, notification_created_at, notification_id)
    references core.notifications (tenant_id, created_at, id),
  foreign key (tenant_id, user_id) references core.users (tenant_id, id),
  constraint notification_deliveries_channel_check check (channel in ('email', 'sms')),
  constraint notification_deliveries_locale_check check (locale in ('ar', 'en')),
  constraint notification_deliveries_state_check check (state in ('pending', 'sent', 'failed', 'skipped')),
  constraint notification_deliveries_reason_check
    check (reason is null or reason in ('preference_off', 'no_address', 'unreachable', 'no_provider',
      'withdrawn', 'provider_error', 'gave_up')),
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
create index notification_deliveries_recent_idx on core.notification_deliveries (tenant_id, created_at desc);

alter table core.notifications enable row level security;
create policy tenant_isolation on core.notifications as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.notifications for all to cell_owner using (true) with check (true);
create policy p_select on core.notifications for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.notifications for insert to app, worker, cell_io with check (true);
create policy p_update on core.notifications for update to app, worker, cell_io using (true) with check (true);

alter table core.notification_deliveries enable row level security;
create policy tenant_isolation on core.notification_deliveries as restrictive for all to public
  using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()));
create policy owner_all on core.notification_deliveries for all to cell_owner using (true) with check (true);
create policy p_select on core.notification_deliveries for select to app, worker, cell_io, retention using (true);
create policy p_insert on core.notification_deliveries for insert to app, worker, cell_io with check (true);
create policy p_update on core.notification_deliveries for update to app, worker, cell_io using (true) with check (true);

create trigger row_meta before insert or update on core.notifications for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.notification_deliveries for each row execute function app.row_meta();

alter table core.notifications force row level security;
alter table core.notification_deliveries force row level security;

grant select, insert, update on core.notifications, core.notification_deliveries to app, worker, cell_io;
grant select on core.notifications, core.notification_deliveries to retention;

set local timezone = 'UTC';
insert into ops.partitioned_tables (schema_name, table_name, period)
values ('core', 'notifications', 'month'), ('core', 'notification_deliveries', 'month');
select app.ensure_partitions(3);
