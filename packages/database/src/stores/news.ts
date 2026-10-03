import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PostVisibility, SiteLocale, SiteState } from "../tables/site";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface PostRow {
  id: string;
  version: number;
  orgId: string;
  categoryId: string | null;
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  coverFileId: string | null;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
  state: SiteState;
  visibility: PostVisibility;
  /** The language the post was first written in, once it has words. */
  primaryLocale: SiteLocale | null;
  publishedAt: string | null;
  revisedAt: string | null;
  authorNameEn: string | null;
  authorNameAr: string | null;
}

type PostRecord = {
  id: string;
  version: number;
  org_id: string;
  category_id: string | null;
  slug: string;
  title_en: string;
  title_ar: string;
  excerpt_en: string;
  excerpt_ar: string;
  cover_file_id: string | null;
  cover_alt_en: string;
  cover_alt_ar: string;
  pinned: boolean;
  state: SiteState;
  visibility: PostVisibility;
  primary_locale: SiteLocale | null;
  published_at: string | null;
  revised_at: string | null;
  author_en: string | null;
  author_ar: string | null;
};

const original = (column: string) =>
  sql`(select d.${sql.identifier(column)} from core.documents d
    where d.tenant_id = p.tenant_id and d.host_type = 'site_post' and d.host_id = p.id
      and d.status = 'active' and d.translation_of_id is null
    order by d.date_last_modified desc limit 1)`;

const postColumns = sql`p.id, p.version, p.org_id, p.category_id, p.slug, p.title_en, p.title_ar,
  p.excerpt_en, p.excerpt_ar, p.cover_file_id, p.cover_alt_en, p.cover_alt_ar, p.pinned, p.state,
  p.visibility, ${original("locale")} as primary_locale,
  ${isoOf(sql`p.published_at`)} as published_at, ${isoOf(sql`p.revised_at`)} as revised_at,
  u.full_name_en as author_en, u.full_name_ar as author_ar`;

const postFrom = sql`core.site_posts p
  join core.users u on u.tenant_id = p.tenant_id and u.id = p.author_user_id`;

function postOf(row: PostRecord): PostRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    categoryId: row.category_id,
    slug: row.slug,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    excerptEn: row.excerpt_en,
    excerptAr: row.excerpt_ar,
    coverFileId: row.cover_file_id,
    coverAltEn: row.cover_alt_en,
    coverAltAr: row.cover_alt_ar,
    pinned: row.pinned,
    state: row.state,
    visibility: row.visibility,
    primaryLocale: row.primary_locale,
    publishedAt: row.published_at,
    revisedAt: row.revised_at,
    authorNameEn: row.author_en,
    authorNameAr: row.author_ar,
  };
}

/** The words readers received last, for previews and search. */
export const publishedPostText = sql`(select v.plain_text from core.documents d
  join core.document_versions v on v.tenant_id = d.tenant_id and v.document_id = d.id
    and v.reason = 'publish' and v.redacted_at is null
  where d.tenant_id = p.tenant_id and d.host_type = 'site_post' and d.host_id = p.id
    and d.status = 'active' and d.translation_of_id is null
  order by v.created_at desc, v.document_version desc limit 1)`;

export type PostTab = "published" | "scheduled" | "drafts" | "archived";

const tabFilter: Record<PostTab, ReturnType<typeof sql>> = {
  published: sql`p.state = 'published' and p.published_at <= statement_timestamp()`,
  scheduled: sql`p.state = 'published' and p.published_at > statement_timestamp()`,
  drafts: sql`p.state = 'draft'`,
  archived: sql`p.state = 'archived'`,
};

export interface ManagedPost extends PostRow {
  recipients: number;
  read: number;
}

/** The school's posts on one tab, pinned first then newest, with every tab's count. */
export async function managedPosts(
  tx: Tx,
  input: { tenantId: string; orgId: string; tab: PostTab; q: string },
): Promise<{ rows: ManagedPost[]; counts: Record<PostTab, number> }> {
  const needle = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
  const scope = sql`p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.orgId}::uuid
    and p.status = 'active'`;
  const search = input.q
    ? sql`and (p.title_en ilike ${needle} or p.title_ar ilike ${needle})`
    : sql``;
  const rows = await tx.execute<
    PostRecord & { recipients: number; read: number }
  >(sql`
    select ${postColumns},
      (select count(*)::int from core.site_post_recipients r
        where r.tenant_id = p.tenant_id and r.post_id = p.id and r.status = 'active') as recipients,
      (select count(*)::int from core.site_post_recipients r
        where r.tenant_id = p.tenant_id and r.post_id = p.id and r.status = 'active'
          and r.read_at is not null) as read
    from ${postFrom}
    where ${scope} and ${tabFilter[input.tab]} ${search}
    order by p.pinned desc, coalesce(p.published_at, p.date_last_modified) desc, p.id
    limit 200`);
  const [counts] = await tx.execute<Record<PostTab, number>>(sql`
    select
      count(*) filter (where ${tabFilter.published})::int as published,
      count(*) filter (where ${tabFilter.scheduled})::int as scheduled,
      count(*) filter (where ${tabFilter.drafts})::int as drafts,
      count(*) filter (where ${tabFilter.archived})::int as archived
    from core.site_posts p where ${scope} ${search}`);
  return {
    rows: rows.map((row) => ({
      ...postOf(row),
      recipients: row.recipients,
      read: row.read,
    })),
    counts: counts ?? { published: 0, scheduled: 0, drafts: 0, archived: 0 },
  };
}

export async function postById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<PostRow | null> {
  const [row] = await tx.execute<PostRecord>(sql`
    select ${postColumns} from ${postFrom}
    where p.tenant_id = ${tenantId}::uuid and p.id = ${id}::uuid and p.status = 'active'`);
  return row ? postOf(row) : null;
}

export interface PostFields {
  categoryId: string | null;
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  coverFileId: string | null;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
  visibility: PostVisibility;
}

export async function insertPost(
  tx: Tx,
  input: PostFields & { tenantId: string; orgId: string; authorId: string },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.site_posts (tenant_id, org_id, category_id, slug, title_en, title_ar,
      excerpt_en, excerpt_ar, cover_file_id, cover_alt_en, cover_alt_ar, pinned, visibility,
      author_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.categoryId}::uuid,
      ${input.slug}, ${input.titleEn}, ${input.titleAr}, ${input.excerptEn}, ${input.excerptAr},
      ${input.coverFileId}::uuid, ${input.coverAltEn}, ${input.coverAltAr}, ${input.pinned},
      ${input.visibility}, ${input.authorId}::uuid)
    returning id, version`);
  if (!row) throw new Error("post was not inserted");
  return row;
}

export async function updatePost(
  tx: Tx,
  input: PostFields & { tenantId: string; id: string; expectedVersion: number },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_posts
    set category_id = ${input.categoryId}::uuid, slug = ${input.slug},
        title_en = ${input.titleEn}, title_ar = ${input.titleAr},
        excerpt_en = ${input.excerptEn}, excerpt_ar = ${input.excerptAr},
        cover_file_id = ${input.coverFileId}::uuid, cover_alt_en = ${input.coverAltEn},
        cover_alt_ar = ${input.coverAltAr}, pinned = ${input.pinned},
        visibility = ${input.visibility},
        revised_at = case when state = 'published' then statement_timestamp() else revised_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function setPostState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: SiteState;
    publishedAt: string | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_posts
    set state = ${input.state}, published_at = ${input.publishedAt}::timestamptz,
        revised_at = null
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Adds the people a post reaches; those it already reached keep their state. */
export async function addPostRecipients(
  tx: Tx,
  input: { tenantId: string; postId: string; userIds: readonly string[] },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.site_post_recipients (tenant_id, post_id, user_id)
    select ${input.tenantId}::uuid, ${input.postId}::uuid, u
    from unnest(${uuidArray(input.userIds)}) as u
    on conflict do nothing
    returning id`);
  return rows.length;
}

export async function postRecipientOf(
  tx: Tx,
  input: { tenantId: string; postId: string; userId: string },
): Promise<{ readAt: string | null } | null> {
  const [row] = await tx.execute<{ read_at: string | null }>(sql`
    select ${isoOf(sql`read_at`)} as read_at from core.site_post_recipients
    where tenant_id = ${input.tenantId}::uuid and post_id = ${input.postId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active'`);
  return row ? { readAt: row.read_at } : null;
}

export async function markPostRead(
  tx: Tx,
  input: { tenantId: string; postId: string; userId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.site_post_recipients set read_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and post_id = ${input.postId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and read_at is null`);
}

export interface NewsRow extends PostRow {
  summary: string;
  /** Null when the post reached the reader through the website, not an audience. */
  readAt: string | null;
  recipient: boolean;
}

/**
 * The posts a person may read inside the school, newest first: every post out
 * on the website, and school posts that reached them.
 */
export async function newsFor(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    viewerId: string;
    q: string;
    limit: number;
  },
): Promise<NewsRow[]> {
  const q = input.q ? `%${input.q}%` : null;
  const rows = await tx.execute<
    PostRecord & {
      summary: string | null;
      read_at: string | null;
      recipient: boolean;
    }
  >(sql`
    select ${postColumns}, left(t.text, 240) as summary,
      ${isoOf(sql`r.read_at`)} as read_at, r.id is not null as recipient
    from ${postFrom}
    left join core.site_post_recipients r on r.tenant_id = p.tenant_id and r.post_id = p.id
      and r.user_id = ${input.viewerId}::uuid and r.status = 'active'
    cross join lateral (select ${publishedPostText} as text) t
    where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.schoolId}::uuid
      and p.status = 'active' and p.state = 'published' and p.published_at <= statement_timestamp()
      and (p.visibility = 'public' or r.id is not null)
      and (${q}::text is null or p.title_en ilike ${q} or p.title_ar ilike ${q} or t.text ilike ${q})
    order by p.published_at desc, p.id
    limit ${input.limit}`);
  return rows.map((row) => ({
    ...postOf(row),
    summary: row.summary ?? "",
    readAt: row.read_at,
    recipient: row.recipient,
  }));
}

export interface PostReportRow {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  readAt: string | null;
}

/** Who a post reached, those yet to open it first. */
export async function postReport(
  tx: Tx,
  input: { tenantId: string; postId: string },
): Promise<PostReportRow[]> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    read_at: string | null;
  }>(sql`
    select r.user_id, u.full_name_en, u.full_name_ar, ${isoOf(sql`r.read_at`)} as read_at
    from core.site_post_recipients r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.user_id
    where r.tenant_id = ${input.tenantId}::uuid and r.post_id = ${input.postId}::uuid
      and r.status = 'active'
    order by r.read_at nulls first, u.full_name_en, u.id
    limit 2000`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    readAt: row.read_at,
  }));
}
