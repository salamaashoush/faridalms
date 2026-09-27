import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

export interface HistoryEntry {
  id: string;
  occurredAt: string;
  action: string;
  outcome: "success" | "denied" | "failed";
  actorNameEn: string | null;
  actorNameAr: string | null;
  changed: string[];
}

/**
 * What happened to a person, newest first: every audited change whose subject
 * they are. Values stay in the payloads; this shows who changed which fields.
 */
export async function historyOf(
  tx: CellTransaction,
  tenantId: string,
  subjectUserId: string,
  options: { limit: number; before?: string },
): Promise<HistoryEntry[]> {
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    outcome: HistoryEntry["outcome"];
    actor_en: string | null;
    actor_ar: string | null;
    details: { changed?: string[] };
  }>(sql`
    select l.id, l.occurred_at::text as occurred_at, l.action, l.outcome,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar, l.details
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    where l.tenant_id = ${tenantId}::uuid and l.subject_user_id = ${subjectUserId}::uuid
      and (${options.before ?? null}::timestamptz is null or l.occurred_at < ${options.before ?? null}::timestamptz)
    order by l.occurred_at desc, l.id desc
    limit ${options.limit}`);
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    action: row.action,
    outcome: row.outcome,
    actorNameEn: row.actor_en,
    actorNameAr: row.actor_ar,
    changed: Array.isArray(row.details.changed) ? row.details.changed : [],
  }));
}
