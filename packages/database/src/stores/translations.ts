import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf } from "./sql";

type Tx = CellTransaction;

/** Hosts whose words are written in two languages, and the table each lives in. */
const HOSTS = {
  site_post: "site_posts",
  announcement: "announcements",
  privacy_notice: "privacy_notices",
  lesson: "lessons",
} as const;
export type TranslatedHost = keyof typeof HOSTS;

const tableOf = (host: TranslatedHost) =>
  sql`core.${sql.identifier(HOSTS[host])}`;

/**
 * A digest of a host's original words, spacing aside, which tells whether a
 * translation checked against it still matches what it says.
 */
const originalDigest = (host: TranslatedHost) =>
  sql`(select md5(btrim(regexp_replace(d.plain_text, '\\s+', ' ', 'g')))
    from core.documents d
    where d.tenant_id = h.tenant_id and d.host_type = ${host} and d.host_id = h.id
      and d.status = 'active' and d.translation_of_id is null
    order by d.date_last_modified desc limit 1)`;

export interface TranslationReview {
  at: string;
  byEn: string | null;
  byAr: string | null;
  /** The original still says what it said when the translation was checked. */
  current: boolean;
}

export async function translationReview(
  tx: Tx,
  input: { tenantId: string; host: TranslatedHost; id: string },
): Promise<TranslationReview | null> {
  const [row] = await tx.execute<{
    at: string;
    by_en: string | null;
    by_ar: string | null;
    current: boolean | null;
  }>(sql`
    select ${isoOf(sql`h.translation_reviewed_at`)} as at,
      u.full_name_en as by_en, u.full_name_ar as by_ar,
      h.translation_source_digest = ${originalDigest(input.host)} as current
    from ${tableOf(input.host)} h
    join core.users u on u.tenant_id = h.tenant_id and u.id = h.translation_reviewed_by_user_id
    where h.tenant_id = ${input.tenantId}::uuid and h.id = ${input.id}::uuid
      and h.status = 'active' and h.translation_reviewed_at is not null`);
  return row
    ? {
        at: row.at,
        byEn: row.by_en,
        byAr: row.by_ar,
        current: row.current === true,
      }
    : null;
}

/**
 * Records that the translation was checked against the original as it now
 * reads, keeping who checked it first while the original is unchanged, or
 * clears the check. Returns the host's new version, or null when nothing
 * changed.
 */
export async function reviewTranslation(
  tx: Tx,
  input: {
    tenantId: string;
    host: TranslatedHost;
    id: string;
    userId: string;
    reviewed: boolean;
  },
): Promise<number | null> {
  const table = tableOf(input.host);
  const [row] = await tx.execute<{ version: number }>(sql`
    with next as (
      select h.id, case when ${input.reviewed} then ${originalDigest(input.host)} end as digest
      from ${table} h
      where h.tenant_id = ${input.tenantId}::uuid and h.id = ${input.id}::uuid
        and h.status = 'active'
    )
    update ${table} h
    set translation_source_digest = next.digest,
        translation_reviewed_at = case when next.digest is null then null
          else statement_timestamp() end,
        translation_reviewed_by_user_id = case when next.digest is null then null
          else ${input.userId}::uuid end
    from next
    where h.tenant_id = ${input.tenantId}::uuid and h.id = next.id
      and h.translation_source_digest is distinct from next.digest
    returning h.version`);
  return row?.version ?? null;
}
