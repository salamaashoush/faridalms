import { sql } from "drizzle-orm";

import type { CellTransaction } from "./context";

const DENIED_COLUMNS = new Set([
  "ciphertext",
  "identifier_ciphertext",
  "identifier_hmac",
  "secret_hash",
  "pin_hash",
  "token_hash",
  "key_hash",
  "wrapped_dek",
  "push_token_ciphertext",
  "ydoc",
]);

/** Tables whose every column stays out of payloads. */
const DENIED_TABLES = new Set([
  "health.records",
  "health.requested_changes",
  "core.demographics",
  "core.relationship_restrictions",
]);

const snake = (key: string) =>
  key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

type Row = Record<string, unknown>;

export interface AuditChange {
  /** Schema-qualified table, `core.users`. */
  table: string;
  before: Row | null;
  after: Row | null;
}

export interface AuditEntry {
  action: string;
  objectType: string;
  objectId?: string | null;
  orgId?: string | null;
  subjectUserId?: string | null;
  studentUserId?: string | null;
  outcome?: "success" | "denied" | "failed";
  details?: Row;
  change?: AuditChange;
}

function normalise(row: Row | null): Row | null {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      snake(key),
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

/**
 * Splits a change into the payload that may be kept and the names of the
 * fields that changed. Denied columns, and every column of the special
 * category tables, appear only by name.
 */
export function payloadOf(change: AuditChange): {
  before: Row | null;
  after: Row | null;
  changed: string[];
} {
  const before = normalise(change.before);
  const after = normalise(change.after);
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changed = [...keys]
    .filter(
      (key) =>
        JSON.stringify(before?.[key] ?? null) !==
        JSON.stringify(after?.[key] ?? null),
    )
    .toSorted();
  if (DENIED_TABLES.has(change.table))
    return { before: null, after: null, changed };
  const keep = (row: Row | null) =>
    row &&
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !DENIED_COLUMNS.has(key)),
    );
  return { before: keep(before), after: keep(after), changed };
}

/**
 * Writes one audit row in the caller's transaction. The trigger fills the
 * time and the actor from the unit of work; values go to a salted payload
 * whose digest the row carries, so erasing the payload leaves the chain intact.
 */
export async function writeAudit(
  tx: CellTransaction,
  tenantId: string,
  entry: AuditEntry,
): Promise<string> {
  const payload = entry.change ? payloadOf(entry.change) : null;
  const details = {
    ...entry.details,
    ...(payload && payload.changed.length > 0
      ? { changed: payload.changed }
      : {}),
  };
  const keepPayload =
    payload !== null && (payload.before !== null || payload.after !== null);
  const salt = keepPayload ? crypto.getRandomValues(new Uint8Array(16)) : null;
  const before = keepPayload ? payload.before : null;
  const after = keepPayload ? payload.after : null;
  const saltBuffer = salt ? Buffer.from(salt) : null;
  const digest = keepPayload
    ? sql`sha256(${saltBuffer}::bytea || convert_to(jsonb_build_array(${before}::jsonb, ${after}::jsonb)::text, 'UTF8'))`
    : sql`null`;
  const rows = await tx.execute<{ id: string; occurred_at: string }>(sql`
    insert into audit.log (tenant_id, action, outcome, object_type, object_id, org_id,
      subject_user_id, student_user_id, details, payload_digest)
    values (${tenantId}::uuid, ${entry.action}, ${entry.outcome ?? "success"}, ${entry.objectType},
      ${entry.objectId ?? null}::uuid, ${entry.orgId ?? null}::uuid, ${entry.subjectUserId ?? null}::uuid,
      ${entry.studentUserId ?? null}::uuid, ${details}::jsonb, ${digest})
    returning id, occurred_at::text as occurred_at`);
  const row = rows[0];
  if (!row) throw new Error("audit row was not written");
  if (keepPayload)
    await tx.execute(sql`
      insert into audit.payloads (tenant_id, event_id, occurred_at, subject_user_id, salt, before, after)
      values (${tenantId}::uuid, ${row.id}::uuid, ${row.occurred_at}::timestamptz,
        ${entry.subjectUserId ?? null}::uuid, ${saltBuffer}::bytea, ${before}::jsonb, ${after}::jsonb)`);
  return row.id;
}
