import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { NewsletterLocale, NewsletterState } from "../tables/newsletters";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface NewsletterRow {
  id: string;
  version: number;
  orgId: string;
  title: string;
  primaryLocale: NewsletterLocale;
  bilingual: boolean;
  state: NewsletterState;
  publishAt: string | null;
  authorUserId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  revisedAt: string | null;
}

const columns = sql`n.id, n.version, n.org_id, n.title, n.primary_locale, n.bilingual, n.state,
  ${isoOf(sql`n.publish_at`)} as publish_at, n.author_user_id,
  u.full_name_en as author_en, u.full_name_ar as author_ar,
  ${isoOf(sql`n.revised_at`)} as revised_at`;

type NewsletterRecord = {
  id: string;
  version: number;
  org_id: string;
  title: string;
  primary_locale: NewsletterLocale;
  bilingual: boolean;
  state: NewsletterState;
  publish_at: string | null;
  author_user_id: string;
  author_en: string | null;
  author_ar: string | null;
  revised_at: string | null;
};

function rowOf(row: NewsletterRecord): NewsletterRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    title: row.title,
    primaryLocale: row.primary_locale,
    bilingual: row.bilingual,
    state: row.state,
    publishAt: row.publish_at,
    authorUserId: row.author_user_id,
    authorNameEn: row.author_en,
    authorNameAr: row.author_ar,
    revisedAt: row.revised_at,
  };
}

/** The published text of an edition's original, for previews and search. */
export const publishedText = sql`(select v.plain_text from core.documents d
  join core.document_versions v on v.tenant_id = d.tenant_id and v.document_id = d.id
    and v.reason = 'publish' and v.redacted_at is null
  where d.tenant_id = n.tenant_id and d.host_type = 'newsletter' and d.host_id = n.id
    and d.status = 'active' and d.translation_of_id is null
  order by v.created_at desc, v.document_version desc limit 1)`;

export async function newsletterById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<NewsletterRow | null> {
  const [row] = await tx.execute<NewsletterRecord>(sql`
    select ${columns} from core.newsletters n
    join core.users u on u.tenant_id = n.tenant_id and u.id = n.author_user_id
    where n.tenant_id = ${tenantId}::uuid and n.id = ${id}::uuid and n.status = 'active'`);
  return row ? rowOf(row) : null;
}

export interface NewsletterFields {
  title: string;
  primaryLocale: NewsletterLocale;
  bilingual: boolean;
}

export async function insertNewsletter(
  tx: Tx,
  input: NewsletterFields & {
    tenantId: string;
    schoolId: string;
    authorId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.newsletters (tenant_id, org_id, title, primary_locale, bilingual, author_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.title},
            ${input.primaryLocale}, ${input.bilingual}, ${input.authorId}::uuid)
    returning id, version`);
  if (!row) throw new Error("newsletter not written");
  return row;
}

export async function updateNewsletter(
  tx: Tx,
  input: NewsletterFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.newsletters
    set title = ${input.title}, primary_locale = ${input.primaryLocale}, bilingual = ${input.bilingual}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Moves an edition on; the version it was read at must still hold. */
export async function setNewsletterState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: NewsletterState;
    publishAt: string | null;
    revised?: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.newsletters
    set state = ${input.state}, publish_at = ${input.publishAt}::timestamptz,
        revised_at = case when ${input.revised ?? false} then statement_timestamp() else revised_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Adds the people an edition reaches; those it already reached keep their state. */
export async function addNewsletterRecipients(
  tx: Tx,
  input: { tenantId: string; newsletterId: string; userIds: readonly string[] },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.newsletter_recipients (tenant_id, newsletter_id, user_id)
    select ${input.tenantId}::uuid, ${input.newsletterId}::uuid, u
    from unnest(${uuidArray(input.userIds)}) as u
    on conflict do nothing
    returning id`);
  return rows.length;
}

export async function newsletterRecipientOf(
  tx: Tx,
  input: { tenantId: string; newsletterId: string; userId: string },
): Promise<{ readAt: string | null } | null> {
  const [row] = await tx.execute<{ read_at: string | null }>(sql`
    select ${isoOf(sql`read_at`)} as read_at from core.newsletter_recipients
    where tenant_id = ${input.tenantId}::uuid and newsletter_id = ${input.newsletterId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active'`);
  return row ? { readAt: row.read_at } : null;
}

export async function markNewsletterRead(
  tx: Tx,
  input: { tenantId: string; newsletterId: string; userId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.newsletter_recipients set read_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and newsletter_id = ${input.newsletterId}::uuid
      and user_id = ${input.userId}::uuid and status = 'active' and read_at is null`);
}

export interface EditionRow extends NewsletterRow {
  summary: string;
  readAt: string | null;
}

/** The editions that reached a person and are out, newest first. */
export async function editionsFor(
  tx: Tx,
  input: { tenantId: string; schoolId: string; viewerId: string; q: string },
): Promise<EditionRow[]> {
  const q = input.q ? `%${input.q}%` : null;
  const rows = await tx.execute<
    NewsletterRecord & { summary: string | null; read_at: string | null }
  >(sql`
    select ${columns}, left(p.text, 240) as summary, ${isoOf(sql`r.read_at`)} as read_at
    from core.newsletter_recipients r
    join core.newsletters n on n.tenant_id = r.tenant_id and n.id = r.newsletter_id
      and n.status = 'active' and n.org_id = ${input.schoolId}::uuid
      and n.state in ('scheduled', 'published') and n.publish_at <= statement_timestamp()
    join core.users u on u.tenant_id = n.tenant_id and u.id = n.author_user_id
    cross join lateral (select ${publishedText} as text) p
    where r.tenant_id = ${input.tenantId}::uuid and r.user_id = ${input.viewerId}::uuid
      and r.status = 'active'
      and (${q}::text is null or n.title ilike ${q} or p.text ilike ${q})
    order by n.publish_at desc, n.id
    limit 200`);
  return rows.map((row) => ({
    ...rowOf(row),
    summary: row.summary ?? "",
    readAt: row.read_at,
  }));
}

export interface ManagedNewsletter extends NewsletterRow {
  recipients: number;
  read: number;
}

/** Every edition the school has written or is writing, for those who manage them. */
export async function managedNewsletters(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    states: readonly NewsletterState[];
    q: string;
  },
): Promise<ManagedNewsletter[]> {
  const q = input.q ? `%${input.q}%` : null;
  const rows = await tx.execute<
    NewsletterRecord & { recipients: number; read: number }
  >(sql`
    select ${columns},
           (select count(*)::int from core.newsletter_recipients r
             where r.tenant_id = n.tenant_id and r.newsletter_id = n.id and r.status = 'active') as recipients,
           (select count(*)::int from core.newsletter_recipients r
             where r.tenant_id = n.tenant_id and r.newsletter_id = n.id and r.status = 'active'
               and r.read_at is not null) as read
    from core.newsletters n
    join core.users u on u.tenant_id = n.tenant_id and u.id = n.author_user_id
    where n.tenant_id = ${input.tenantId}::uuid and n.org_id = ${input.schoolId}::uuid
      and n.status = 'active' and n.state = any(${textArray(input.states)})
      and (${q}::text is null or n.title ilike ${q})
    order by coalesce(n.publish_at, n.date_last_modified) desc, n.id
    limit 200`);
  return rows.map((row) => ({
    ...rowOf(row),
    recipients: row.recipients,
    read: row.read,
  }));
}

export interface NewsletterReportRow {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  readAt: string | null;
}

/** Who an edition reached, those yet to open it first. */
export async function newsletterReport(
  tx: Tx,
  input: { tenantId: string; newsletterId: string },
): Promise<NewsletterReportRow[]> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    read_at: string | null;
  }>(sql`
    select r.user_id, u.full_name_en, u.full_name_ar, ${isoOf(sql`r.read_at`)} as read_at
    from core.newsletter_recipients r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.user_id
    where r.tenant_id = ${input.tenantId}::uuid and r.newsletter_id = ${input.newsletterId}::uuid
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
