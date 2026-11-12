import type { Feed, Keyset } from "@faridalms/domain/paging";

import { feedOf } from "@faridalms/domain/paging";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { holds, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export type SharedScope = "mine" | "school";
export type SharedKind = "block" | "section";

export interface SharedBlockRow {
  id: string;
  orgId: string;
  ownerUserId: string;
  ownerNameEn: string | null;
  ownerNameAr: string | null;
  scope: SharedScope;
  kind: SharedKind;
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
  kind: SharedKind;
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
  kind: row.kind,
  title: row.title,
  version: row.version,
  updatedAt: row.updated_at,
});

const columns = sql`b.id, b.org_id, b.owner_user_id, u.full_name_en as name_en,
  u.full_name_ar as name_ar, b.scope, b.kind, b.title, b.version,
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
    kind: SharedKind;
    search: string;
    scope: "all" | SharedScope;
    limit: number;
    after: Keyset | null;
  },
): Promise<Feed<SharedBlockRow, Keyset>> {
  const words = input.search.trim();
  const after = input.after;
  const rows = await tx.execute<SharedRecord>(sql`
    select ${columns}
    from core.shared_blocks b
    left join core.users u on u.tenant_id = b.tenant_id and u.id = b.owner_user_id
    where b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.orgId}::uuid
      and b.status = 'active' and b.kind = ${input.kind}
      and (b.scope = 'school' or b.owner_user_id = ${input.userId}::uuid)
      ${input.scope === "mine" ? sql`and b.owner_user_id = ${input.userId}::uuid` : sql``}
      ${input.scope === "school" ? sql`and b.scope = 'school'` : sql``}
      ${words ? sql`and ${holds(words, [sql`b.title`])}` : sql``}
      and (${after === null}::boolean
        or (date_trunc('milliseconds', b.date_last_modified), b.id)
          < (${after?.at ?? null}::timestamptz, ${after?.id ?? null}::uuid))
    order by date_trunc('milliseconds', b.date_last_modified) desc, b.id desc
    limit ${input.limit + 1}`);
  return feedOf(rows.map(sharedOf), input.limit, (row) => ({
    at: row.updatedAt,
    id: row.id,
  }));
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
  input: {
    tenantId: string;
    orgId: string;
    ids: readonly string[];
    kind?: SharedKind;
  },
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
      and b.status = 'active' and b.kind = ${input.kind ?? "block"}
      and b.id = any(${uuidArray(input.ids)})`);
}

export type SharedUseHost =
  | "lesson"
  | "assignment"
  | "module_plan"
  | "announcement"
  | "site_page";

/** A record whose working document shows a shared block. */
export interface SharedUse {
  hostType: SharedUseHost;
  hostId: string;
}

/**
 * The records whose working documents show a shared block. Handed-in
 * copies are left out, since they keep the block as it was.
 */
export async function sharedBlockUses(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string; kind?: SharedKind },
): Promise<SharedUse[]> {
  // A page names a shared section as one of its sections; a document shows
  // a shared block as a node anywhere in it.
  const named =
    input.kind === "section"
      ? sql`d.host_type = 'site_page' and jsonb_path_exists(d.content,
        'lax $.sections[*] ? (@.shared == $id)',
        jsonb_build_object('id', ${input.id}::text))`
      : sql`jsonb_path_exists(d.content,
        'lax $.** ? (@.type == "shared" && @.sharedId == $id)',
        jsonb_build_object('id', ${input.id}::text))`;
  const rows = await tx.execute<{
    host_type: SharedUseHost;
    host_id: string;
  }>(sql`
    select distinct d.host_type, d.host_id
    from core.documents d
    where d.tenant_id = ${input.tenantId}::uuid and d.org_id = ${input.orgId}::uuid
      and d.status = 'active' and d.frozen_at is null and d.translation_of_id is null
      and d.host_type in ('lesson', 'assignment', 'module_plan', 'announcement',
        'site_page')
      and ${named}
    limit 200`);
  return rows.map((row) => ({ hostType: row.host_type, hostId: row.host_id }));
}

/** Shared blocks' titles, for the documents that show others. */
export async function sharedBlockTitles(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const rows = await tx.execute<{ id: string; title: string }>(sql`
    select id, title from core.shared_blocks
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray(ids)}) and status = 'active'`);
  return new Map(rows.map((row) => [row.id, row.title]));
}

export async function insertSharedBlock(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ownerUserId: string;
    scope: SharedScope;
    kind?: SharedKind;
    title: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.shared_blocks (tenant_id, org_id, owner_user_id, scope, kind, title)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.ownerUserId}::uuid,
      ${input.scope}, ${input.kind ?? "block"}, ${input.title})
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
