import type { NoticeParams } from "@faridalms/domain/notifications";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  DeliveryChannel,
  DeliveryReason,
  DeliveryState,
  NotificationKind,
} from "../tables/partitioned";

import { holds, isoOf, textArray, uuidArray } from "./sql";

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

/** People who already hold an unread notification of the same kind about the same subject. */
export async function holdingUnread(
  tx: Tx,
  input: {
    tenantId: string;
    kind: NotificationKind;
    subjectType: string;
    subjectId: string;
    userIds: readonly string[];
  },
): Promise<Set<string>> {
  if (input.userIds.length === 0) return new Set();
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct user_id from core.notifications
    where tenant_id = ${input.tenantId}::uuid and kind = ${input.kind}
      and subject_type = ${input.subjectType}
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
  input: {
    tenantId: string;
    /** The school writing, whose language is used for someone who chose none. */
    orgId: string;
    userIds: readonly string[];
  },
): Promise<Reachability[]> {
  if (input.userIds.length === 0) return [];
  const rows = await tx.execute<{
    user_id: string;
    locale: "ar" | "en" | null;
    preferences: unknown;
    email: string | null;
    phone: string | null;
  }>(sql`
    select u.id as user_id,
      coalesce(u.preferred_locale, (select o.default_locale from core.orgs o
        where o.tenant_id = u.tenant_id and o.id = ${input.orgId}::uuid)) as locale,
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

/**
 * Records a sign-in link emailed to a person, an invitation or a reset, in
 * the delivery log beside every other email. The link went within the
 * request, so the row says how it went rather than waiting to be sent.
 */
export async function logLinkDelivery(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    userId: string;
    purpose: "invite" | "reset" | "register";
    address: string;
    locale: "ar" | "en";
    receipt: string | null;
    error: string | null;
  },
): Promise<void> {
  const sent = input.error === null;
  await tx.execute(sql`
    insert into core.notification_deliveries (tenant_id, user_id, link_purpose, org_id, channel,
      address, locale, state, reason, due_at, attempts, last_error, receipt, sent_at)
    values (${input.tenantId}::uuid, ${input.userId}::uuid, ${input.purpose},
      ${input.orgId}::uuid, 'email', ${input.address}, ${input.locale},
      ${sent ? "sent" : "failed"}, ${sent ? null : "provider_error"}, statement_timestamp(), 1,
      ${input.error?.slice(0, 500) ?? null}, ${input.receipt},
      ${sent ? sql`statement_timestamp()` : null})`);
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
    /** Kinds not to list: those of modules that are off. */
    hidden: readonly string[];
  },
): Promise<{ rows: NotificationRow[]; total: number }> {
  const filter = sql`n.tenant_id = ${input.tenantId}::uuid and n.user_id = ${input.userId}::uuid
    and n.org_id = ${input.orgId}::uuid and n.status = 'active'
    and not (n.kind = any(${textArray(input.hidden)}))
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
  input: {
    tenantId: string;
    userId: string;
    orgId: string;
    hidden: readonly string[];
  },
): Promise<{ unread: number; waiting: number }> {
  const [row] = await tx.execute<{ unread: number; waiting: number }>(sql`
    select count(*) filter (where read_at is null)::int as unread,
           count(*) filter (where needs_action and acted_at is null)::int as waiting
    from core.notifications
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id = ${input.orgId}::uuid and status = 'active'
      and not (kind = any(${textArray(input.hidden)}))
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
  kind: NotificationKind | "message" | "invite" | "reset" | "register";
  title: string | null;
  /** The person told; null for an outside contact a conversation wrote to. */
  userId: string | null;
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
  const filter = sql`d.tenant_id = ${input.tenantId}::uuid and d.status = 'active'
    and coalesce(n.org_id, h.org_id, d.org_id) = ${input.orgId}::uuid
    and (${input.state} = 'all' or d.state = ${input.state})
    and (${input.channel} = 'all' or d.channel = ${input.channel})
    and (${holds(input.q, [sql`u.full_name_en`, sql`u.full_name_ar`, sql`c.display_name`, sql`n.params ->> 'title'`, sql`h.subject`])})`;
  const from = sql`core.notification_deliveries d
    left join core.notifications n on n.tenant_id = d.tenant_id
      and n.created_at = d.notification_created_at and n.id = d.notification_id
    left join core.users u on u.tenant_id = d.tenant_id and u.id = d.user_id
    left join core.message_contacts c on c.tenant_id = d.tenant_id and c.id = d.contact_id
    left join core.messages x on x.tenant_id = d.tenant_id and x.id = d.message_id
    left join core.message_threads h on h.tenant_id = x.tenant_id and h.id = x.thread_id`;
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
    kind: DeliveryLogRow["kind"];
    title: string | null;
    user_id: string | null;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select d.id, ${isoOf(sql`d.created_at`)} as created_at, d.channel, d.state, d.reason,
           ${isoOf(sql`d.due_at`)} as due_at, ${isoOf(sql`d.sent_at`)} as sent_at, d.attempts,
           d.last_error, coalesce(n.kind, d.link_purpose, 'message') as kind,
           coalesce(n.params ->> 'title', h.subject) as title, d.user_id,
           coalesce(u.full_name_en, c.display_name) as full_name_en,
           coalesce(u.full_name_ar, c.display_name) as full_name_ar
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
  orgId: string;
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
  /** The digits the school writes Arabic in, which its mail follows. */
  digits: "latn" | "arab";
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
    org_id: string;
    name_en: string | null;
    name_ar: string | null;
    digits: "latn" | "arab";
  }>(sql`
    select d.id, d.created_at::text as created_at, n.org_id, d.user_id, d.channel, d.address, d.locale,
           d.attempts, coalesce((d.metadata ->> 'digest')::boolean, false) as digest,
           n.kind, n.params, o.name_en, o.name_ar, o.digits
    from core.notification_deliveries d
    join core.notifications n on n.tenant_id = d.tenant_id and n.created_at = d.notification_created_at
      and n.id = d.notification_id
    join core.orgs o on o.tenant_id = n.tenant_id and o.id = n.org_id
    where d.tenant_id = ${input.tenantId}::uuid and d.state = 'pending' and d.status = 'active'
      and d.user_id is not null
      and d.due_at <= ${input.now.toISOString()}::timestamptz and d.address is not null
    order by d.user_id, d.channel, d.due_at
    limit ${input.limit}
    for update of d skip locked`);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    orgId: row.org_id,
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
    digits: row.digits,
  }));
}

export interface NewConversationMail {
  contactId: string;
  address: string;
  locale: "ar" | "en";
  state: "pending" | "skipped";
  reason: DeliveryReason | null;
}

/**
 * One ledger row per outside contact a conversation's message goes to by
 * email, in the same unit as the message, so the office's delivery log
 * answers for the family as it does for anyone else.
 */
export async function queueConversationMail(
  tx: Tx,
  input: {
    tenantId: string;
    messageId: string;
    rows: readonly NewConversationMail[];
  },
): Promise<void> {
  if (input.rows.length === 0) return;
  await tx.execute(sql`
    insert into core.notification_deliveries (tenant_id, contact_id, message_id, channel, address,
      locale, state, reason, due_at)
    values ${sql.join(
      input.rows.map(
        (row) => sql`(${input.tenantId}::uuid, ${row.contactId}::uuid,
          ${input.messageId}::uuid, 'email', ${row.address}, ${row.locale}, ${row.state},
          ${row.reason}, statement_timestamp())`,
      ),
      sql`, `,
    )}`);
}

export interface DueConversationMail {
  id: string;
  createdAt: string;
  attempts: number;
  address: string;
  locale: "ar" | "en";
  messageId: string;
  /** The contact's place in the conversation, which its reply token names. */
  memberId: string | null;
  subject: string | null;
  body: string;
  content: Record<string, unknown> | null;
  schoolNameEn: string | null;
  schoolNameAr: string | null;
  schoolEmail: string | null;
  /** The provider's id of the newest mail the family sent into it, to answer in its thread. */
  inReplyTo: string | null;
  files: {
    id: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
    storageKey: string;
  }[];
}

/** Messages due to go to outside contacts, locked so a second worker passes over them. */
export async function claimConversationMail(
  tx: Tx,
  input: { tenantId: string; now: Date; limit: number },
): Promise<DueConversationMail[]> {
  const rows = await tx.execute<{
    id: string;
    created_at: string;
    attempts: number;
    address: string;
    locale: "ar" | "en";
    message_id: string;
    member_id: string | null;
    subject: string | null;
    body: string;
    content: Record<string, unknown> | null;
    name_en: string | null;
    name_ar: string | null;
    email: string | null;
    in_reply_to: string | null;
    files: {
      id: string;
      name: string;
      media_type: string;
      size_bytes: number;
      storage_key: string;
    }[];
  }>(sql`
    select d.id, d.created_at::text as created_at, d.attempts, d.address, d.locale, d.message_id,
      m.id as member_id, t.subject, x.body, doc.content,
      o.name_en, o.name_ar, o.email,
      (select p.details ->> 'messageId' from core.messages p
        where p.tenant_id = x.tenant_id and p.thread_id = x.thread_id
          and p.author_contact_id = d.contact_id and p.details ? 'messageId'
        order by p.created_at desc limit 1) as in_reply_to,
      coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name,
          'media_type', f.media_type, 'size_bytes', f.size_bytes, 'storage_key', f.storage_key)
          order by f.created_at, f.id)
        from core.document_files l
        join core.files f on f.tenant_id = l.tenant_id and f.id = l.file_id
          and f.status = 'active' and f.state = 'ready'
        where l.tenant_id = x.tenant_id and l.document_id = doc.id and l.status = 'active'),
        '[]'::jsonb) as files
    from core.notification_deliveries d
    join core.messages x on x.tenant_id = d.tenant_id and x.id = d.message_id
    join core.message_threads t on t.tenant_id = x.tenant_id and t.id = x.thread_id
    join core.orgs o on o.tenant_id = t.tenant_id and o.id = t.org_id
    left join core.thread_members m on m.tenant_id = x.tenant_id and m.thread_id = x.thread_id
      and m.contact_id = d.contact_id and m.status = 'active' and m.left_at is null
    left join lateral (select g.id, g.content from core.documents g
      where g.tenant_id = x.tenant_id and g.host_type = 'message' and g.host_id = x.id
        and g.status = 'active'
      order by g.created_at desc limit 1) doc on true
    where d.tenant_id = ${input.tenantId}::uuid and d.state = 'pending' and d.status = 'active'
      and d.message_id is not null and d.address is not null
      and d.due_at <= ${input.now.toISOString()}::timestamptz
    order by d.due_at
    limit ${input.limit}
    for update of d skip locked`);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    attempts: row.attempts,
    address: row.address,
    locale: row.locale,
    messageId: row.message_id,
    memberId: row.member_id,
    subject: row.subject,
    body: row.body,
    content: row.content,
    schoolNameEn: row.name_en,
    schoolNameAr: row.name_ar,
    schoolEmail: row.email,
    inReplyTo: row.in_reply_to,
    files: row.files.map((file) => ({
      id: file.id,
      name: file.name,
      mediaType: file.media_type,
      sizeBytes: file.size_bytes,
      storageKey: file.storage_key,
    })),
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

/**
 * What the school told these people about one student, newest first: one
 * row per notice, with who received it and who has read it.
 */
export async function noticesAbout(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentId: string;
    userIds: readonly string[];
    limit: number;
  },
): Promise<
  {
    kind: NotificationKind;
    subjectId: string;
    params: NoticeParams;
    createdAt: string;
    recipients: {
      userId: string;
      nameEn: string | null;
      nameAr: string | null;
      read: boolean;
    }[];
  }[]
> {
  if (input.userIds.length === 0) return [];
  const rows = await tx.execute<{
    kind: NotificationKind;
    subject_id: string;
    params: NoticeParams;
    created_at: string;
    recipients: {
      user_id: string;
      name_en: string | null;
      name_ar: string | null;
      read: boolean;
    }[];
  }>(sql`
    select n.kind, n.subject_id, (array_agg(n.params))[1] as params,
      ${isoOf(sql`min(n.created_at)`)} as created_at,
      jsonb_agg(jsonb_build_object('user_id', n.user_id, 'name_en', u.full_name_en,
        'name_ar', u.full_name_ar, 'read', n.read_at is not null)) as recipients
    from core.notifications n
    join core.users u on u.tenant_id = n.tenant_id and u.id = n.user_id
    where n.tenant_id = ${input.tenantId}::uuid and n.org_id = ${input.orgId}::uuid
      and n.status = 'active' and n.user_id = any(${uuidArray(input.userIds)})
      and n.params->>'studentId' = ${input.studentId}
    group by n.kind, n.subject_id, date_trunc('minute', n.created_at)
    order by min(n.created_at) desc
    limit ${input.limit}`);
  return rows.map((row) => ({
    kind: row.kind,
    subjectId: row.subject_id,
    params: row.params,
    createdAt: row.created_at,
    recipients: row.recipients.map((recipient) => ({
      userId: recipient.user_id,
      nameEn: recipient.name_en,
      nameAr: recipient.name_ar,
      read: recipient.read,
    })),
  }));
}

/** Why mail no longer goes to an address: it bounced for good, or its reader reported it as spam. */
export type Unreachable = "bounced" | "complained";

/**
 * Stops mail to an address the provider reported: every outside contact
 * and every person's email at it is stamped, the first report kept, so
 * delivery skips it from now and staff see why. Answers the contacts and
 * the people stamped.
 */
export async function markAddressUnreachable(
  tx: Tx,
  input: { tenantId: string; address: string; reason: Unreachable },
): Promise<{ contactIds: string[]; people: string[] }> {
  const address = input.address.trim().toLowerCase();
  const column =
    input.reason === "bounced" ? sql`bounced_at` : sql`complaint_at`;
  const contacts = await tx.execute<{ id: string }>(sql`
    update core.message_contacts set ${column} = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and email = ${address} and status = 'active'
      and ${column} is null
    returning id`);
  const people = await tx.execute<{ user_id: string }>(sql`
    update core.contact_points set ${column} = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and kind = 'email' and status = 'active'
      and lower(coalesce(normalized, value)) = ${address} and ${column} is null
    returning user_id`);
  return {
    contactIds: contacts.map((row) => row.id),
    people: [...new Set(people.map((row) => row.user_id))],
  };
}
