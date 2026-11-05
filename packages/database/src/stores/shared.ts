import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { holds, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export type SharedScope = "mine" | "school";

export interface SharedBlockRow {
  id: string;
  orgId: string;
  ownerUserId: string;
  ownerNameEn: string | null;
  ownerNameAr: string | null;
  scope: SharedScope;
  title: string;
  version: number;
  updatedAt: string;
}

type SharedRecord = {
  id: string;
  org_id: string;
  owner_user_id: string;
  name_en: string | null;
  name_ar: string | null;
  scope: SharedScope;
  title: string;
  version: number;
  updated_at: string;
};

const sharedOf = (row: SharedRecord): SharedBlockRow => ({
  id: row.id,
  orgId: row.org_id,
  ownerUserId: row.owner_user_id,
  ownerNameEn: row.name_en,
  ownerNameAr: row.name_ar,
  scope: row.scope,
  title: row.title,
  version: row.version,
  updatedAt: row.updated_at,
});

const columns = sql`b.id, b.org_id, b.owner_user_id, u.full_name_en as name_en,
  u.full_name_ar as name_ar, b.scope, b.title, b.version,
  ${isoOf(sql`b.date_last_modified`)} as updated_at`;

/**
 * The shared blocks a teacher may use: their own, and those kept for the
 * school, newest first, narrowed by words in the title or by whose they are.
 */
export async function sharedBlocksOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    userId: string;
    search: string;
    scope: "all" | SharedScope;
  },
): Promise<SharedBlockRow[]> {
  const words = input.search.trim();
  const rows = await tx.execute<SharedRecord>(sql`
    select ${columns}
    from core.shared_blocks b
    left join core.users u on u.tenant_id = b.tenant_id and u.id = b.owner_user_id
    where b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.orgId}::uuid
      and b.status = 'active'
      and (b.scope = 'school' or b.owner_user_id = ${input.userId}::uuid)
      ${input.scope === "mine" ? sql`and b.owner_user_id = ${input.userId}::uuid` : sql``}
      ${input.scope === "school" ? sql`and b.scope = 'school'` : sql``}
      ${words ? sql`and ${holds(words, [sql`b.title`])}` : sql``}
    order by b.date_last_modified desc, b.id
    limit 100`);
  return rows.map(sharedOf);
}

export async function sharedBlockById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<SharedBlockRow | null> {
  const [row] = await tx.execute<SharedRecord>(sql`
    select ${columns}
    from core.shared_blocks b
    left join core.users u on u.tenant_id = b.tenant_id and u.id = b.owner_user_id
    where b.tenant_id = ${tenantId}::uuid and b.id = ${id}::uuid and b.status = 'active'`);
  return row ? sharedOf(row) : null;
}

/** Shared blocks with the document each holds, for drawing many at once. */
export async function sharedContents(
  tx: Tx,
  input: { tenantId: string; orgId: string; ids: readonly string[] },
): Promise<{ id: string; title: string; content: Record<string, unknown> }[]> {
  if (input.ids.length === 0) return [];
  return tx.execute<{
    id: string;
    title: string;
    content: Record<string, unknown>;
  }>(sql`
    select b.id, b.title, d.content
    from core.shared_blocks b
    join core.documents d on d.tenant_id = b.tenant_id
      and d.host_type = 'shared_block' and d.host_id = b.id and d.status = 'active'
    where b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.orgId}::uuid
      and b.status = 'active' and b.id = any(${uuidArray(input.ids)})`);
}

export type SharedUseHost =
  | "lesson"
  | "assignment"
  | "module_plan"
  | "announcement"
  | "news"
  | "site_page";

export interface SharedUse {
  hostType: SharedUseHost;
  hostId: string;
  titleEn: string | null;
  titleAr: string | null;
  /** Where it sits: a lesson's module, an assignment's class. */
  placeEn: string | null;
  placeAr: string | null;
}

/**
 * The documents showing a shared block, as their working copies stand, by
 * the title of what each belongs to. Handed-in copies are left out, since
 * they keep the block as it was.
 */
export async function sharedBlockUses(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<SharedUse[]> {
  const rows = await tx.execute<{
    host_type: SharedUseHost;
    host_id: string;
    title_en: string | null;
    title_ar: string | null;
    place_en: string | null;
    place_ar: string | null;
  }>(sql`
    select d.host_type, d.host_id,
      coalesce(l.title, a.title, m.title, nullif(n.title_en, ''), nullif(sp.title_en, ''))
        as title_en,
      coalesce(l.title, a.title, m.title, nullif(n.title_ar, ''), nullif(sp.title_ar, ''))
        as title_ar,
      coalesce(lm.title, c.title_en) as place_en, coalesce(lm.title, c.title_ar) as place_ar
    from core.documents d
    left join core.lessons l on l.tenant_id = d.tenant_id and l.id = d.host_id
      and d.host_type = 'lesson' and l.status = 'active'
    left join core.learning_modules lm on lm.tenant_id = l.tenant_id and lm.id = l.module_id
    left join core.assignments a on a.tenant_id = d.tenant_id and a.id = d.host_id
      and d.host_type = 'assignment' and a.status = 'active'
    left join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
    left join core.learning_modules m on m.tenant_id = d.tenant_id and m.id = d.host_id
      and d.host_type = 'module_plan' and m.status = 'active'
    left join core.broadcasts n on n.tenant_id = d.tenant_id and n.id = d.host_id
      and d.host_type = n.kind and n.status = 'active'
    left join core.site_pages sp on sp.tenant_id = d.tenant_id and sp.id = d.host_id
      and d.host_type = 'site_page' and sp.status = 'active'
    where d.tenant_id = ${input.tenantId}::uuid and d.org_id = ${input.orgId}::uuid
      and d.status = 'active' and d.frozen_at is null and d.translation_of_id is null
      and d.host_type in ('lesson', 'assignment', 'module_plan', 'announcement',
        'news', 'site_page')
      and coalesce(l.id, a.id, m.id, n.id, sp.id) is not null
      and jsonb_path_exists(d.content,
        'lax $.** ? (@.type == "shared" && @.sharedId == $id)',
        jsonb_build_object('id', ${input.id}::text))
    order by title_en, place_en, d.host_id
    limit 200`);
  return rows.map((row) => ({
    hostType: row.host_type,
    hostId: row.host_id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    placeEn: row.place_en,
    placeAr: row.place_ar,
  }));
}

export async function insertSharedBlock(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ownerUserId: string;
    scope: SharedScope;
    title: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.shared_blocks (tenant_id, org_id, owner_user_id, scope, title)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.ownerUserId}::uuid,
      ${input.scope}, ${input.title})
    returning id, version`);
  if (!row) throw new Error("shared block not written");
  return row;
}

/** Changes a shared block's title or whose it is; null when another change came first. */
export async function updateSharedBlock(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    scope: SharedScope;
    title: string;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.shared_blocks
    set scope = ${input.scope}, title = ${input.title}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function removeSharedBlock(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.shared_blocks set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}
