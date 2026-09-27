import type { NoticeParams } from "@faridalms/domain/notifications";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  DeliveryChannel,
  DeliveryReason,
  DeliveryState,
  NotificationKind,
} from "../tables/partitioned";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  subjectType: string;
  subjectId: string;
  params: NoticeParams;
  needsAction: boolean;
}

export interface InsertedNotification {
  id: string;
  createdAt: string;
  userId: string;
}

export async function insertNotifications(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    actorId: string | null;
    rows: readonly NewNotification[];
  },
): Promise<InsertedNotification[]> {
  if (input.rows.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    created_at: string;
    user_id: string;
  }>(sql`
    insert into core.notifications (tenant_id, user_id, org_id, kind, subject_type, subject_id,
      actor_user_id, params, needs_action)
    values ${sql.join(
      input.rows.map(
        (
          row,
        ) => sql`(${input.tenantId}::uuid, ${row.userId}::uuid, ${input.orgId}::uuid,
          ${row.kind}, ${row.subjectType}, ${row.subjectId}::uuid, ${input.actorId}::uuid,
          ${row.params}::jsonb, ${row.needsAction})`,
      ),
      sql`, `,
    )}
    returning id, created_at::text as created_at, user_id`);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
  }));
}

/** People who already hold an unread notification about the same subject. */
export async function holdingUnread(
  tx: Tx,
  input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    userIds: readonly string[];
  },
): Promise<Set<string>> {
  if (input.userIds.length === 0) return new Set();
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct user_id from core.notifications
    where tenant_id = ${input.tenantId}::uuid and subject_type = ${input.subjectType}
      and subject_id = ${input.subjectId}::uuid and status = 'active' and read_at is null
      and created_at > statement_timestamp() - interval '14 days'
      and user_id = any(${uuidArray(input.userIds)})`);
  return new Set(rows.map((row) => row.user_id));
}

/** Whether a notice about the subject carrying this key is already out. */
export async function noticed(
  tx: Tx,
  input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    key: { param: string; value: string };
  },
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from core.notifications
      where tenant_id = ${input.tenantId}::uuid and subject_type = ${input.subjectType}
        and subject_id = ${input.subjectId}::uuid and status = 'active'
        and params ->> ${input.key.param} = ${input.key.value}) as found`);
  return row?.found ?? false;
}

export interface Reachability {
  userId: string;
  locale: "ar" | "en";
  preferences: unknown;
  email: string | null;
  phone: string | null;
}

/**
 * What delivery needs about each person: their language, their choices, and
 * the address and number they can be reached at, skipping bounced,
 * complained and unsubscribed ones.
 */
export async function reachability(
  tx: Tx,
  input: { tenantId: string; userIds: readonly string[] },
): Promise<Reachability[]> {
  if (input.userIds.length === 0) return [];
  const rows = await tx.execute<{
    user_id: string;
    locale: "ar" | "en" | null;
    preferences: unknown;
    email: string | null;
    phone: string | null;
  }>(sql`
    select u.id as user_id, u.preferred_locale as locale,
      (select p.value from core.user_preferences p
        where p.tenant_id = u.tenant_id and p.user_id = u.id and p.key = 'notifications'
          and p.status = 'active') as preferences,
      (select c.value from core.contact_points c
        where c.tenant_id = u.tenant_id and c.user_id = u.id and c.kind = 'email'
          and c.status = 'active' and c.bounced_at is null and c.complaint_at is null
          and c.unsubscribed_at is null
        order by c.priority nulls last, c.created_at limit 1) as email,
      (select coalesce(c.normalized, c.value) from core.contact_points c
        where c.tenant_id = u.tenant_id and c.user_id = u.id and c.kind = 'phone'
          and c.status = 'active' and coalesce(c.sms_capable, false) and c.unsubscribed_at is null
        order by c.priority nulls last, c.created_at limit 1) as phone
    from core.users u
    where u.tenant_id = ${input.tenantId}::uuid and u.id = any(${uuidArray(input.userIds)})`);
  return rows.map((row) => ({
    userId: row.user_id,
    locale: row.locale ?? "en",
    preferences: row.preferences,
    email: row.email,
    phone: row.phone,
  }));
}

export interface NewDelivery {
  notificationId: string;
  notificationCreatedAt: string;
  userId: string;
  channel: DeliveryChannel;
  address: string | null;
  locale: "ar" | "en";
  state: DeliveryState;
  reason: DeliveryReason | null;
  dueAt: Date;
  digest: boolean;
}

export async function insertDeliveries(
  tx: Tx,
  input: { tenantId: string; rows: readonly NewDelivery[] },
): Promise<void> {
  if (input.rows.length === 0) return;
  await tx.execute(sql`
    insert into core.notification_deliveries (tenant_id, notification_id, notification_created_at,
      user_id, channel, address, locale, state, reason, due_at, metadata)
    values ${sql.join(
      input.rows.map(
        (row) => sql`(${input.tenantId}::uuid, ${row.notificationId}::uuid,
          ${row.notificationCreatedAt}::timestamptz, ${row.userId}::uuid, ${row.channel},
          ${row.address}, ${row.locale}, ${row.state}, ${row.reason},
          ${row.dueAt.toISOString()}::timestamptz,
          ${row.digest ? sql`'{"digest":true}'::jsonb` : sql`'{}'::jsonb`})`,
      ),
      sql`, `,
    )}`);
}

export interface NotificationRow {
  id: string;
  createdAt: string;
  kind: NotificationKind;
  subjectType: string;
  subjectId: string;
  params: NoticeParams;
  needsAction: boolean;
  readAt: string | null;
  actedAt: string | null;
  actorNameEn: string | null;
  actorNameAr: string | null;
}

type NotificationRecord = {
  id: string;
  created_at: string;
  kind: NotificationKind;
  subject_type: string;
  subject_id: string;
  params: NoticeParams;
  needs_action: boolean;
  read_at: string | null;
  acted_at: string | null;
  actor_en: string | null;
  actor_ar: string | null;
};

/** A person's notifications, newest first; the action tab keeps those still waiting on them. */
export async function notificationsOf(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    orgId: string;
    tab: "action" | "all";
    limit: number;
    offset: number;
  },
): Promise<{ rows: NotificationRow[]; total: number }> {
  const filter = sql`n.tenant_id = ${input.tenantId}::uuid and n.user_id = ${input.userId}::uuid
    and n.org_id = ${input.orgId}::uuid and n.status = 'active'
    and (${input.tab === "all"} or (n.needs_action and n.acted_at is null))`;
  const [count] = await tx.execute<{ total: number }>(sql`
    select count(*)::int as total from core.notifications n where ${filter}`);
  const rows = await tx.execute<NotificationRecord>(sql`
    select n.id, ${isoOf(sql`n.created_at`)} as created_at, n.kind, n.subject_type, n.subject_id,
           n.params, n.needs_action, ${isoOf(sql`n.read_at`)} as read_at,
           ${isoOf(sql`n.acted_at`)} as acted_at,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar
    from core.notifications n
    left join core.users a on a.tenant_id = n.tenant_id and a.id = n.actor_user_id
    where ${filter}
    order by n.created_at desc, n.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total: count?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      kind: row.kind,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      params: row.params,
      needsAction: row.needs_action,
      readAt: row.read_at,
      actedAt: row.acted_at,
      actorNameEn: row.actor_en,
      actorNameAr: row.actor_ar,
    })),
  };
}

export async function unreadCount(
  tx: Tx,
  input: { tenantId: string; userId: string; orgId: string },
): Promise<{ unread: number; waiting: number }> {
  const [row] = await tx.execute<{ unread: number; waiting: number }>(sql`
    select count(*) filter (where read_at is null)::int as unread,
           count(*) filter (where needs_action and acted_at is null)::int as waiting
    from core.notifications
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id = ${input.orgId}::uuid and status = 'active'
      and (read_at is null or (needs_action and acted_at is null))`);
  return { unread: row?.unread ?? 0, waiting: row?.waiting ?? 0 };
}

export async function markRead(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    orgId: string;
    ids: readonly string[];
  },
): Promise<void> {
  await tx.execute(sql`
    update core.notifications set read_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id = ${input.orgId}::uuid and status = 'active' and read_at is null
      and (${input.ids.length === 0} or id = any(${uuidArray(input.ids)}))`);
}

/** The person opened what the notifications are about, so they read them. */
export async function readSubject(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    subjectType: string;
    subjectId: string;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.notifications set read_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and subject_type = ${input.subjectType} and subject_id = ${input.subjectId}::uuid
      and read_at is null and status = 'active'`);
}

/** The person did what the notification asked, so it leaves their action list. */
export async function markActed(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    subjectType: string;
    subjectId: string;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.notifications
    set acted_at = statement_timestamp(), read_at = coalesce(read_at, statement_timestamp())
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and subject_type = ${input.subjectType} and subject_id = ${input.subjectId}::uuid
      and needs_action and acted_at is null and status = 'active'`);
}

/**
 * Takes back notifications about a subject that no longer holds (an absence
 * corrected), and stops what has not left yet.
 */
export async function withdraw(
  tx: Tx,
  input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    key?: { param: string; value: string };
  },
): Promise<number> {
  const keyFilter = input.key
    ? sql`and n.params ->> ${input.key.param} = ${input.key.value}`
    : sql``;
  const rows = await tx.execute<{ id: string }>(sql`
    update core.notifications n set status = 'tobedeleted'
    where n.tenant_id = ${input.tenantId}::uuid and n.subject_type = ${input.subjectType}
      and n.subject_id = ${input.subjectId}::uuid and n.status = 'active' ${keyFilter}
    returning n.id`);
  if (rows.length === 0) return 0;
  await tx.execute(sql`
    update core.notification_deliveries set state = 'skipped', reason = 'withdrawn'
    where tenant_id = ${input.tenantId}::uuid and state = 'pending'
      and notification_id = any(${uuidArray(rows.map((row) => row.id))})`);
  return rows.length;
}

export interface DeliveryLogRow {
  id: string;
  createdAt: string;
  channel: DeliveryChannel;
  state: DeliveryState;
  reason: DeliveryReason | null;
  dueAt: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  kind: NotificationKind;
  title: string | null;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

/** Every attempt to reach someone outside the app, newest first, for the school's office. */
export async function deliveryLog(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    state: DeliveryState | "all";
    channel: DeliveryChannel | "all";
    q: string;
    limit: number;
    offset: number;
  },
): Promise<{ rows: DeliveryLogRow[]; total: number }> {
  const q = input.q ? `%${input.q}%` : null;
  const filter = sql`d.tenant_id = ${input.tenantId}::uuid and d.status = 'active'
    and n.org_id = ${input.orgId}::uuid
    and (${input.state} = 'all' or d.state = ${input.state})
    and (${input.channel} = 'all' or d.channel = ${input.channel})
    and (${q}::text is null or u.full_name_en ilike ${q} or u.full_name_ar ilike ${q}
      or n.params ->> 'title' ilike ${q})`;
  const from = sql`core.notification_deliveries d
    join core.notifications n on n.tenant_id = d.tenant_id and n.created_at = d.notification_created_at
      and n.id = d.notification_id
    join core.users u on u.tenant_id = d.tenant_id and u.id = d.user_id`;
  const [count] = await tx.execute<{ total: number }>(sql`
    select count(*)::int as total from ${from} where ${filter}`);
  const rows = await tx.execute<{
    id: string;
    created_at: string;
    channel: DeliveryChannel;
    state: DeliveryState;
    reason: DeliveryReason | null;
    due_at: string;
    sent_at: string | null;
    attempts: number;
    last_error: string | null;
    kind: NotificationKind;
    title: string | null;
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select d.id, ${isoOf(sql`d.created_at`)} as created_at, d.channel, d.state, d.reason,
           ${isoOf(sql`d.due_at`)} as due_at, ${isoOf(sql`d.sent_at`)} as sent_at, d.attempts,
           d.last_error, n.kind, n.params ->> 'title' as title, d.user_id,
           u.full_name_en, u.full_name_ar
    from ${from}
    where ${filter}
    order by d.created_at desc, d.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total: count?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      channel: row.channel,
      state: row.state,
      reason: row.reason,
      dueAt: row.due_at,
      sentAt: row.sent_at,
      attempts: row.attempts,
      lastError: row.last_error,
      kind: row.kind,
      title: row.title,
      userId: row.user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
    })),
  };
}

export interface DueDelivery {
  id: string;
  createdAt: string;
  userId: string;
  channel: DeliveryChannel;
  address: string;
  locale: "ar" | "en";
  attempts: number;
  digest: boolean;
  kind: NotificationKind;
  params: NoticeParams;
  schoolNameEn: string | null;
  schoolNameAr: string | null;
}

/**
 * Deliveries whose time has come, locked so a second worker passes over them.
 * A person's digest items come back together, so they leave as one message.
 */
export async function claimDue(
  tx: Tx,
  input: { tenantId: string; now: Date; limit: number },
): Promise<DueDelivery[]> {
  const rows = await tx.execute<{
    id: string;
    created_at: string;
    user_id: string;
    channel: DeliveryChannel;
    address: string;
    locale: "ar" | "en";
    attempts: number;
    digest: boolean;
    kind: NotificationKind;
    params: NoticeParams;
    name_en: string | null;
    name_ar: string | null;
  }>(sql`
    select d.id, d.created_at::text as created_at, d.user_id, d.channel, d.address, d.locale,
           d.attempts, coalesce((d.metadata ->> 'digest')::boolean, false) as digest,
           n.kind, n.params, o.name_en, o.name_ar
    from core.notification_deliveries d
    join core.notifications n on n.tenant_id = d.tenant_id and n.created_at = d.notification_created_at
      and n.id = d.notification_id
    join core.orgs o on o.tenant_id = n.tenant_id and o.id = n.org_id
    where d.tenant_id = ${input.tenantId}::uuid and d.state = 'pending' and d.status = 'active'
      and d.due_at <= ${input.now.toISOString()}::timestamptz and d.address is not null
    order by d.user_id, d.channel, d.due_at
    limit ${input.limit}
    for update of d skip locked`);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    channel: row.channel,
    address: row.address,
    locale: row.locale,
    attempts: row.attempts,
    digest: row.digest,
    kind: row.kind,
    params: row.params,
    schoolNameEn: row.name_en,
    schoolNameAr: row.name_ar,
  }));
}

export async function settleDeliveries(
  tx: Tx,
  input: {
    tenantId: string;
    ids: readonly { id: string; createdAt: string }[];
    outcome:
      | { state: "sent"; receipt: string | null }
      | { state: "skipped"; reason: DeliveryReason }
      | {
          state: "failed";
          error: string;
          giveUp: boolean;
          retryAt: Date | null;
        };
  },
): Promise<void> {
  if (input.ids.length === 0) return;
  const keys = sql.join(
    input.ids.map(
      (row) => sql`(${row.createdAt}::timestamptz, ${row.id}::uuid)`,
    ),
    sql`, `,
  );
  if (input.outcome.state === "sent") {
    await tx.execute(sql`
      update core.notification_deliveries
      set state = 'sent', sent_at = statement_timestamp(), attempts = attempts + 1,
          receipt = ${input.outcome.receipt}
      where tenant_id = ${input.tenantId}::uuid and (created_at, id) in (${keys})`);
    return;
  }
  if (input.outcome.state === "skipped") {
    await tx.execute(sql`
      update core.notification_deliveries set state = 'skipped', reason = ${input.outcome.reason}
      where tenant_id = ${input.tenantId}::uuid and (created_at, id) in (${keys})`);
    return;
  }
  const error = input.outcome.error.slice(0, 500);
  if (input.outcome.giveUp || !input.outcome.retryAt)
    await tx.execute(sql`
      update core.notification_deliveries
      set state = 'failed', reason = 'gave_up', attempts = attempts + 1, last_error = ${error}
      where tenant_id = ${input.tenantId}::uuid and (created_at, id) in (${keys})`);
  else
    await tx.execute(sql`
      update core.notification_deliveries
      set attempts = attempts + 1, last_error = ${error},
          due_at = ${input.outcome.retryAt.toISOString()}::timestamptz
      where tenant_id = ${input.tenantId}::uuid and (created_at, id) in (${keys})`);
}
