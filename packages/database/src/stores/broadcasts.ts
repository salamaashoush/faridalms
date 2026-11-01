import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  BroadcastKind,
  PublicationState,
  Urgency,
} from "../tables/broadcasts";
import type { PostVisibility, SiteLocale } from "../tables/site";

import { liveSql, scheduledSql } from "./publication";
import { escapeLike, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface BroadcastRow {
  id: string;
  version: number;
  orgId: string;
  kind: BroadcastKind;
  titleEn: string;
  titleAr: string;
  /** The language it was first written in, once it has words. */
  primaryLocale: SiteLocale | null;
  state: PublicationState;
  publishAt: string | null;
  toldAt: string | null;
  visibility: PostVisibility;
  authorUserId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  urgency: Urgency;
  pinnedUntil: string | null;
  expiresOn: string | null;
  requiresAck: boolean;
  ackDueOn: string | null;
  updateSentAt: string | null;
  categoryId: string | null;
  slug: string | null;
  excerptEn: string;
  excerptAr: string;
  coverFileId: string | null;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
}

type BroadcastRecord = {
  id: string;
  version: number;
  org_id: string;
  kind: BroadcastKind;
  title_en: string;
  title_ar: string;
  primary_locale: SiteLocale | null;
  state: PublicationState;
  publish_at: string | null;
  told_at: string | null;
  visibility: PostVisibility;
  author_user_id: string;
  author_en: string | null;
  author_ar: string | null;
  urgency: Urgency;
  pinned_until: string | null;
  expires_on: string | null;
  requires_ack: boolean;
  ack_due_on: string | null;
  update_sent_at: string | null;
  category_id: string | null;
  slug: string | null;
  excerpt_en: string;
  excerpt_ar: string;
  cover_file_id: string | null;
  cover_alt_en: string;
  cover_alt_ar: string;
  pinned: boolean;
};

const columns = sql`b.id, b.version, b.org_id, b.kind, b.title_en, b.title_ar,
  (select d.locale from core.documents d where d.tenant_id = b.tenant_id
    and d.host_type = b.kind and d.host_id = b.id and d.status = 'active'
    and d.translation_of_id is null order by d.date_last_modified desc limit 1) as primary_locale,
  b.state, ${isoOf(sql`b.publish_at`)} as publish_at, ${isoOf(sql`b.told_at`)} as told_at,
  b.visibility, b.author_user_id, u.full_name_en as author_en, u.full_name_ar as author_ar,
  b.urgency, to_char(b.pinned_until, 'YYYY-MM-DD') as pinned_until,
  to_char(b.expires_on, 'YYYY-MM-DD') as expires_on, b.requires_ack,
  to_char(b.ack_due_on, 'YYYY-MM-DD') as ack_due_on,
  ${isoOf(sql`b.update_sent_at`)} as update_sent_at, b.category_id, b.slug,
  b.excerpt_en, b.excerpt_ar, b.cover_file_id, b.cover_alt_en, b.cover_alt_ar, b.pinned`;

const from = sql`core.broadcasts b
  join core.users u on u.tenant_id = b.tenant_id and u.id = b.author_user_id`;

const live = liveSql(sql`b.state`, sql`b.publish_at`);
const scheduled = scheduledSql(sql`b.state`, sql`b.publish_at`);

/** The words readers received last, for summaries, previews and search. */
export const publishedText = sql`(select v.plain_text from core.documents d
  join core.document_versions v on v.tenant_id = d.tenant_id and v.document_id = d.id
    and v.reason = 'publish' and v.redacted_at is null
  where d.tenant_id = b.tenant_id and d.host_type = b.kind and d.host_id = b.id
    and d.status = 'active' and d.translation_of_id is null
  order by v.created_at desc, v.document_version desc limit 1)`;

function rowOf(row: BroadcastRecord): BroadcastRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    kind: row.kind,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    primaryLocale: row.primary_locale,
    state: row.state,
    publishAt: row.publish_at,
    toldAt: row.told_at,
    visibility: row.visibility,
    authorUserId: row.author_user_id,
    authorNameEn: row.author_en,
    authorNameAr: row.author_ar,
    urgency: row.urgency,
    pinnedUntil: row.pinned_until,
    expiresOn: row.expires_on,
    requiresAck: row.requires_ack,
    ackDueOn: row.ack_due_on,
    updateSentAt: row.update_sent_at,
    categoryId: row.category_id,
    slug: row.slug,
    excerptEn: row.excerpt_en,
    excerptAr: row.excerpt_ar,
    coverFileId: row.cover_file_id,
    coverAltEn: row.cover_alt_en,
    coverAltAr: row.cover_alt_ar,
    pinned: row.pinned,
  };
}

export async function broadcastById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<BroadcastRow | null> {
  const [row] = await tx.execute<BroadcastRecord>(sql`
    select ${columns} from ${from}
    where b.tenant_id = ${tenantId}::uuid and b.id = ${id}::uuid and b.status = 'active'`);
  return row ? rowOf(row) : null;
}

/** What an author sets on a broadcast; a kind leaves the other kind's settings at their defaults. */
export interface BroadcastFields {
  titleEn: string;
  titleAr: string;
  visibility: PostVisibility;
  urgency: Urgency;
  pinnedUntil: string | null;
  expiresOn: string | null;
  requiresAck: boolean;
  ackDueOn: string | null;
  categoryId: string | null;
  slug: string | null;
  excerptEn: string;
  excerptAr: string;
  coverFileId: string | null;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
}

export async function insertBroadcast(
  tx: Tx,
  input: BroadcastFields & {
    tenantId: string;
    schoolId: string;
    authorId: string;
    kind: BroadcastKind;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.broadcasts (tenant_id, org_id, kind, title_en, title_ar, visibility,
      author_user_id, urgency, pinned_until, expires_on, requires_ack, ack_due_on, category_id,
      slug, excerpt_en, excerpt_ar, cover_file_id, cover_alt_en, cover_alt_ar, pinned)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.kind}, ${input.titleEn},
      ${input.titleAr}, ${input.visibility}, ${input.authorId}::uuid, ${input.urgency},
      ${input.pinnedUntil}::date, ${input.expiresOn}::date, ${input.requiresAck},
      ${input.ackDueOn}::date, ${input.categoryId}::uuid, ${input.slug}, ${input.excerptEn},
      ${input.excerptAr}, ${input.coverFileId}::uuid, ${input.coverAltEn}, ${input.coverAltAr},
      ${input.pinned})
    returning id, version`);
  if (!row) throw new Error("broadcast was not inserted");
  return row;
}

export async function updateBroadcast(
  tx: Tx,
  input: BroadcastFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.broadcasts
    set title_en = ${input.titleEn}, title_ar = ${input.titleAr}, visibility = ${input.visibility},
        urgency = ${input.urgency}, pinned_until = ${input.pinnedUntil}::date,
        expires_on = ${input.expiresOn}::date, requires_ack = ${input.requiresAck},
        ack_due_on = ${input.ackDueOn}::date, category_id = ${input.categoryId}::uuid,
        slug = ${input.slug}, excerpt_en = ${input.excerptEn}, excerpt_ar = ${input.excerptAr},
        cover_file_id = ${input.coverFileId}::uuid, cover_alt_en = ${input.coverAltEn},
        cover_alt_ar = ${input.coverAltAr}, pinned = ${input.pinned}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Moves a broadcast on; the version it was read at must still hold. One
 * told now records it, one set for later waits for the clock, and one taken
 * back is told again when it next goes out.
 */
export async function setBroadcastState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: PublicationState;
    publishAt: string | null;
    told: "now" | "later" | "keep";
    updateSent?: boolean;
  },
): Promise<number | null> {
  const told =
    input.told === "now"
      ? sql`statement_timestamp()`
      : input.told === "later"
        ? sql`null::timestamptz`
        : sql`told_at`;
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.broadcasts
    set state = ${input.state}, publish_at = ${input.publishAt}::timestamptz,
        told_at = case when ${input.state} = 'draft' then null else ${told} end,
        update_sent_at = case when ${input.updateSent ?? false} then statement_timestamp()
                              else update_sent_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Broadcasts out within the last week whose readers have not been told,
 * as one set for later is told once its time comes. The rows are claimed,
 * so two replicas never tell the same one twice.
 */
export async function liveUntold(
  tx: Tx,
  input: { tenantId: string; now: Date; limit: number },
): Promise<BroadcastRow[]> {
  const rows = await tx.execute<BroadcastRecord>(sql`
    select ${columns} from ${from}
    where b.tenant_id = ${input.tenantId}::uuid and b.status = 'active'
      and b.state = 'published' and b.told_at is null
      and b.publish_at <= ${input.now.toISOString()}::timestamptz
      and b.publish_at > ${input.now.toISOString()}::timestamptz - interval '7 days'
    order by b.publish_at
    limit ${input.limit}
    for update of b skip locked`);
  return rows.map(rowOf);
}

export async function markTold(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.broadcasts set told_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and told_at is null`);
}

/** Adds the people a broadcast reaches; those it already reached keep their state. */
export async function addRecipients(
  tx: Tx,
  input: { tenantId: string; broadcastId: string; userIds: readonly string[] },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.broadcast_recipients (tenant_id, broadcast_id, user_id)
    select ${input.tenantId}::uuid, ${input.broadcastId}::uuid, u
    from unnest(${uuidArray(input.userIds)}) as u
    on conflict do nothing
    returning id`);
  return rows.length;
}

/** Everyone a broadcast reached, to tell them once it goes live. */
export async function recipientsOf(
  tx: Tx,
  input: { tenantId: string; broadcastId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select user_id from core.broadcast_recipients
    where tenant_id = ${input.tenantId}::uuid and broadcast_id = ${input.broadcastId}::uuid
      and status = 'active'`);
  return rows.map((row) => row.user_id);
}

export async function recipientOf(
  tx: Tx,
  input: { tenantId: string; broadcastId: string; userId: string },
): Promise<{ readAt: string | null; acknowledgedAt: string | null } | null> {
  const [row] = await tx.execute<{
    read_at: string | null;
    acknowledged_at: string | null;
  }>(sql`
    select ${isoOf(sql`read_at`)} as read_at, ${isoOf(sql`acknowledged_at`)} as acknowledged_at
    from core.broadcast_recipients
    where tenant_id = ${input.tenantId}::uuid and broadcast_id = ${input.broadcastId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active'`);
  return row
    ? { readAt: row.read_at, acknowledgedAt: row.acknowledged_at }
    : null;
}

/** A reader opened a broadcast, or acknowledged it. */
export async function markSeen(
  tx: Tx,
  input: {
    tenantId: string;
    broadcastId: string;
    userId: string;
    acknowledge: boolean;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.broadcast_recipients
    set read_at = coalesce(read_at, statement_timestamp()),
        acknowledged_at = case when ${input.acknowledge}
                               then coalesce(acknowledged_at, statement_timestamp())
                               else acknowledged_at end
    where tenant_id = ${input.tenantId}::uuid and broadcast_id = ${input.broadcastId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** An update was sent: everyone sees the broadcast unread again. */
export async function resetReads(
  tx: Tx,
  input: { tenantId: string; broadcastId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.broadcast_recipients set read_at = null
    where tenant_id = ${input.tenantId}::uuid and broadcast_id = ${input.broadcastId}::uuid
      and status = 'active'`);
}

export interface ReportRow {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
}

/** Who a broadcast reached, those yet to acknowledge or read it first. */
export async function deliveryReport(
  tx: Tx,
  input: { tenantId: string; broadcastId: string },
): Promise<ReportRow[]> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    read_at: string | null;
    acknowledged_at: string | null;
  }>(sql`
    select r.user_id, u.full_name_en, u.full_name_ar,
           ${isoOf(sql`r.read_at`)} as read_at, ${isoOf(sql`r.acknowledged_at`)} as acknowledged_at
    from core.broadcast_recipients r
    join core.broadcasts b on b.tenant_id = r.tenant_id and b.id = r.broadcast_id
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.user_id
    where r.tenant_id = ${input.tenantId}::uuid and r.broadcast_id = ${input.broadcastId}::uuid
      and r.status = 'active'
    order by case when b.requires_ack then r.acknowledged_at end nulls first,
             r.read_at nulls first, u.full_name_en, u.id
    limit 2000`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    readAt: row.read_at,
    acknowledgedAt: row.acknowledged_at,
  }));
}

export type ManageTab = "published" | "scheduled" | "drafts" | "archived";

const tabFilter: Record<ManageTab, ReturnType<typeof sql>> = {
  published: live,
  scheduled,
  drafts: sql`b.state = 'draft'`,
  archived: sql`b.state = 'archived'`,
};

const reached = (filter: ReturnType<typeof sql>) =>
  sql`(select count(*)::int from core.broadcast_recipients r
    where r.tenant_id = b.tenant_id and r.broadcast_id = b.id and r.status = 'active' ${filter})`;

export interface ManagedRow extends BroadcastRow {
  recipients: number;
  read: number;
  acknowledged: number;
}

/** A school's broadcasts of one kind on one tab, pinned first then newest, with every tab's count. */
export async function managedBroadcasts(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    kind: BroadcastKind;
    tab: ManageTab;
    q: string;
  },
): Promise<{ rows: ManagedRow[]; counts: Record<ManageTab, number> }> {
  const needle = `%${escapeLike(input.q)}%`;
  const scope = sql`b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.schoolId}::uuid
    and b.kind = ${input.kind} and b.status = 'active'`;
  const search = input.q
    ? sql`and (b.title_en ilike ${needle} or b.title_ar ilike ${needle})`
    : sql``;
  const rows = await tx.execute<
    BroadcastRecord & { recipients: number; read: number; acknowledged: number }
  >(sql`
    select ${columns}, ${reached(sql``)} as recipients,
      ${reached(sql`and r.read_at is not null`)} as read,
      ${reached(sql`and r.acknowledged_at is not null`)} as acknowledged
    from ${from}
    where ${scope} and ${tabFilter[input.tab]} ${search}
    order by b.pinned desc, coalesce(b.publish_at, b.date_last_modified) desc, b.id
    limit 200`);
  const [counts] = await tx.execute<Record<ManageTab, number>>(sql`
    select
      count(*) filter (where ${tabFilter.published})::int as published,
      count(*) filter (where ${tabFilter.scheduled})::int as scheduled,
      count(*) filter (where ${tabFilter.drafts})::int as drafts,
      count(*) filter (where ${tabFilter.archived})::int as archived
    from core.broadcasts b where ${scope} ${search}`);
  return {
    rows: rows.map((row) => ({
      ...rowOf(row),
      recipients: row.recipients,
      read: row.read,
      acknowledged: row.acknowledged,
    })),
    counts: counts ?? { published: 0, scheduled: 0, drafts: 0, archived: 0 },
  };
}

export interface FeedRow extends BroadcastRow {
  summary: string;
  readAt: string | null;
  acknowledgedAt: string | null;
}

/**
 * The announcements a person has been sent and can read now: pinned first,
 * then newest. Current holds what has not expired; past what has.
 */
export async function announcementFeed(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    today: string;
    tab: "current" | "past";
    q: string;
  },
): Promise<FeedRow[]> {
  const q = input.q ? `%${escapeLike(input.q)}%` : null;
  const rows = await tx.execute<
    BroadcastRecord & {
      summary: string | null;
      pinned_now: boolean;
      read_at: string | null;
      acknowledged_at: string | null;
    }
  >(sql`
    select ${columns}, left(t.text, 240) as summary,
           coalesce(b.pinned_until >= ${input.today}::date, false) as pinned_now,
           ${isoOf(sql`r.read_at`)} as read_at, ${isoOf(sql`r.acknowledged_at`)} as acknowledged_at
    from core.broadcast_recipients r
    join ${from} on b.tenant_id = r.tenant_id and b.id = r.broadcast_id
      and b.status = 'active' and b.org_id = ${input.schoolId}::uuid
      and b.kind = 'announcement' and ${live}
    cross join lateral (select ${publishedText} as text) t
    where r.tenant_id = ${input.tenantId}::uuid and r.user_id = ${input.viewerId}::uuid
      and r.status = 'active'
      and (case when ${input.tab === "past"}
                then b.expires_on < ${input.today}::date
                else b.expires_on is null or b.expires_on >= ${input.today}::date end)
      and (${q}::text is null or b.title_en ilike ${q} or b.title_ar ilike ${q} or t.text ilike ${q})
    order by (${input.tab === "current"} and coalesce(b.pinned_until >= ${input.today}::date, false)) desc,
             b.publish_at desc, b.id
    limit 200`);
  return rows.map((row) => ({
    ...rowOf(row),
    summary: row.summary ?? "",
    pinned: row.pinned_now,
    readAt: row.read_at,
    acknowledgedAt: row.acknowledged_at,
  }));
}

export interface NewsRow extends BroadcastRow {
  summary: string;
  /** Null when the post reached the reader through the website, not an audience. */
  readAt: string | null;
  recipient: boolean;
}

/**
 * A page of the posts a person may read inside the school: every post out
 * on the website, and school posts that reached them, by when they went
 * out or by title in the reader's language first, with how many there are.
 */
export async function newsFor(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    q: string;
    sort: "date" | "title";
    direction: "asc" | "desc";
    locale: "en" | "ar";
    limit: number;
    offset: number;
  },
): Promise<{ rows: NewsRow[]; total: number }> {
  const q = input.q ? `%${escapeLike(input.q)}%` : null;
  const dir = input.direction === "asc" ? sql`asc` : sql`desc`;
  const title =
    input.locale === "ar"
      ? sql`lower(coalesce(nullif(b.title_ar, ''), b.title_en))`
      : sql`lower(coalesce(nullif(b.title_en, ''), b.title_ar))`;
  const order =
    input.sort === "title"
      ? sql`${title} ${dir}, b.publish_at desc, b.id`
      : sql`b.publish_at ${dir}, b.id`;
  const rows = await tx.execute<
    BroadcastRecord & {
      summary: string | null;
      read_at: string | null;
      recipient: boolean;
      total: number;
    }
  >(sql`
    select ${columns}, left(t.text, 240) as summary,
      ${isoOf(sql`r.read_at`)} as read_at, r.id is not null as recipient,
      (count(*) over ())::int as total
    from ${from}
    left join core.broadcast_recipients r on r.tenant_id = b.tenant_id and r.broadcast_id = b.id
      and r.user_id = ${input.viewerId}::uuid and r.status = 'active'
    cross join lateral (select ${publishedText} as text) t
    where b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.schoolId}::uuid
      and b.kind = 'news' and b.status = 'active' and ${live}
      and (b.visibility = 'public' or r.id is not null)
      and (${q}::text is null or b.title_en ilike ${q} or b.title_ar ilike ${q} or t.text ilike ${q})
    order by ${order}
    limit ${input.limit} offset ${input.offset}`);
  return {
    rows: rows.map((row) => ({
      ...rowOf(row),
      summary: row.summary ?? "",
      readAt: row.read_at,
      recipient: row.recipient,
    })),
    total: rows[0]?.total ?? 0,
  };
}
