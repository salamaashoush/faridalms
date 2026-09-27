import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export interface LiveDocument {
  ydoc: Uint8Array | null;
  content: Record<string, unknown>;
  version: number;
}

/** A collaborative document as the collaboration server opens it; others stay hidden. */
export async function liveDocument(
  tx: Tx,
  tenantId: string,
  documentId: string,
): Promise<LiveDocument | null> {
  const [row] = await tx.execute<{
    ydoc: Uint8Array | null;
    content: Record<string, unknown>;
    version: number;
  }>(sql`
    select ydoc, content, version from core.documents
    where tenant_id = ${tenantId}::uuid and id = ${documentId}::uuid
      and collaborative and frozen_at is null and status = 'active'`);
  return row
    ? {
        ydoc: row.ydoc ? new Uint8Array(row.ydoc) : null,
        content: row.content,
        version: row.version,
      }
    : null;
}

/**
 * Stores the shared state with the content derived from it, both at once, or
 * the state alone when the derived content did not validate.
 */
export async function storeLiveDocument(
  tx: Tx,
  input: {
    tenantId: string;
    documentId: string;
    ydoc: Uint8Array;
    derived: { content: Record<string, unknown>; plainText: string } | null;
    userId: string;
  },
): Promise<number | null> {
  const [row] = input.derived
    ? await tx.execute<{ version: number }>(sql`
        update core.documents
        set ydoc = ${Buffer.from(input.ydoc)}, content = ${input.derived.content}::jsonb,
            plain_text = ${input.derived.plainText}, last_edited_by_user_id = ${input.userId}::uuid,
            last_edited_at = statement_timestamp()
        where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid
          and collaborative and frozen_at is null
        returning version`)
    : await tx.execute<{ version: number }>(sql`
        update core.documents
        set ydoc = ${Buffer.from(input.ydoc)}, last_edited_by_user_id = ${input.userId}::uuid,
            last_edited_at = statement_timestamp()
        where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid
          and collaborative and frozen_at is null
        returning version`);
  return row?.version ?? null;
}

/** A checkpoint of what the document holds now, for version history. */
export async function checkpoint(
  tx: Tx,
  input: { tenantId: string; documentId: string; userId: string },
): Promise<void> {
  await tx.execute(sql`
    insert into core.document_versions (tenant_id, document_id, document_version, reason, content,
      plain_text, ydoc_snapshot, created_by_user_id)
    select tenant_id, id, version, 'checkpoint', content, plain_text, ydoc, ${input.userId}::uuid
    from core.documents
    where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid and collaborative
    on conflict do nothing`);
}
