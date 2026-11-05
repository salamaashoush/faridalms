import type { HistoryChange } from "@faridalms/domain/history";
import type { Feed, Keyset } from "@faridalms/domain/paging";

import { historyChanges } from "@faridalms/domain/history";
import { feedOf } from "@faridalms/domain/paging";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf } from "./sql";

export interface HistoryEntry {
  id: string;
  occurredAt: string;
  action: string;
  outcome: "success" | "denied" | "failed";
  actorNameEn: string | null;
  actorNameAr: string | null;
  changed: string[];
  changes: HistoryChange[];
  reason: string | null;
}

/**
 * A person's history holds what was done to them and what was done about
 * them as a student: a hand-in or a mark names the student only in
 * `student_user_id`, the column disclosures are counted by.
 */
export type HistoryAbout =
  | { person: string }
  | { object: { type: string; id: string } };

/**
 * Every audited event about a person or a record, newest first: who changed
 * which fields, the old and new values of those `HISTORY_FIELDS` shows, and
 * the reason given.
 */
export async function historyOf(
  tx: CellTransaction,
  tenantId: string,
  about: HistoryAbout,
  page: { limit: number; after: Keyset | null },
): Promise<Feed<HistoryEntry, Keyset>> {
  const which =
    "person" in about
      ? sql`(l.subject_user_id = ${about.person}::uuid or l.student_user_id = ${about.person}::uuid)`
      : sql`l.object_type = ${about.object.type} and l.object_id = ${about.object.id}::uuid`;
  const after = page.after;
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    outcome: HistoryEntry["outcome"];
    actor_en: string | null;
    actor_ar: string | null;
    details: { changed?: string[]; table?: string };
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>(sql`
    select l.id, ${isoOf(sql`l.occurred_at`)} as occurred_at, l.action, l.outcome,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar, l.details,
           p.before, p.after
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    left join audit.payloads p on p.tenant_id = l.tenant_id and p.event_id = l.id
      and p.occurred_at = l.occurred_at
    where l.tenant_id = ${tenantId}::uuid and ${which}
      and (${after === null}::boolean
        or (date_trunc('milliseconds', l.occurred_at), l.id)
          < (${after?.at ?? null}::timestamptz, ${after?.id ?? null}::uuid))
    order by date_trunc('milliseconds', l.occurred_at) desc, l.id desc
    limit ${page.limit + 1}`);
  return feedOf(
    rows.map((row) => {
      const changed = Array.isArray(row.details.changed)
        ? row.details.changed
        : [];
      const reason = row.after?.reason;
      return {
        id: row.id,
        occurredAt: row.occurred_at,
        action: row.action,
        outcome: row.outcome,
        actorNameEn: row.actor_en,
        actorNameAr: row.actor_ar,
        changed,
        changes: historyChanges(
          row.details.table,
          changed,
          row.before,
          row.after,
        ),
        reason: typeof reason === "string" ? reason : null,
      };
    }),
    page.limit,
    (row) => ({ at: row.occurredAt, id: row.id }),
  );
}
