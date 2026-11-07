import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Host } from "./documents";

import { isoOf } from "./sql";

type Tx = CellTransaction;

export interface DocumentHold {
  userId: string;
  nameEn: string | null;
  nameAr: string | null;
  since: string;
  expiresAt: string;
}

/** Who holds a record's document now, or null when nobody's hold is current. */
export async function holdOf(
  tx: Tx,
  tenantId: string,
  host: Host,
): Promise<DocumentHold | null> {
  const [row] = await tx.execute<{
    user_id: string;
    name_en: string | null;
    name_ar: string | null;
    since: string;
    expires_at: string;
  }>(sql`
    select h.user_id, u.full_name_en as name_en, u.full_name_ar as name_ar,
           ${isoOf(sql`h.held_since`)} as since, ${isoOf(sql`h.expires_at`)} as expires_at
    from core.document_holds h
    join core.users u on u.tenant_id = h.tenant_id and u.id = h.user_id
    where h.tenant_id = ${tenantId}::uuid and h.host_type = ${host.type}
      and h.host_id = ${host.id}::uuid and h.expires_at > statement_timestamp()`);
  return row
    ? {
        userId: row.user_id,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        since: row.since,
        expiresAt: row.expires_at,
      }
    : null;
}

/**
 * Holds a record's document for a person for `seconds` more: renews their
 * own hold, takes one nobody holds or that lapsed, and takes it from
 * someone else only when `force` says so. Answers who holds it after.
 */
export async function takeHold(
  tx: Tx,
  input: {
    tenantId: string;
    host: Host;
    userId: string;
    seconds: number;
    force: boolean;
  },
): Promise<DocumentHold | null> {
  await tx.execute(sql`
    insert into core.document_holds as h
      (tenant_id, host_type, host_id, user_id, held_since, expires_at)
    values (${input.tenantId}::uuid, ${input.host.type}, ${input.host.id}::uuid,
            ${input.userId}::uuid, statement_timestamp(),
            statement_timestamp() + make_interval(secs => ${input.seconds}))
    on conflict (tenant_id, host_type, host_id) do update
      set user_id = excluded.user_id,
          held_since = case
            when h.user_id = excluded.user_id and h.expires_at > statement_timestamp()
            then h.held_since else excluded.held_since end,
          expires_at = excluded.expires_at
      where h.user_id = excluded.user_id
        or h.expires_at <= statement_timestamp()
        or ${input.force}::boolean`);
  return holdOf(tx, input.tenantId, input.host);
}

/** Lets go of a person's own hold at once; someone else's stays. */
export async function releaseHold(
  tx: Tx,
  input: { tenantId: string; host: Host; userId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.document_holds
    set expires_at = greatest(held_since, statement_timestamp())
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.host.type}
      and host_id = ${input.host.id}::uuid and user_id = ${input.userId}::uuid
      and expires_at > statement_timestamp()`);
}
