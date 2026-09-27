import { and, eq, inArray } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";

type Executor = Database | DatabaseTransaction;

export interface FileSummary {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}

export function fileSummary(row: {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}): FileSummary {
  return {
    id: row.id,
    name: row.name,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
  };
}

/** Ready files the owner may attach for a purpose, in the requested order. */
export async function ownedReadyFiles(
  db: Executor,
  ownerId: string,
  ids: string[],
  purpose: (typeof schema.filePurposeEnum.enumValues)[number],
) {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.privateFiles)
    .where(
      and(
        inArray(schema.privateFiles.id, ids),
        eq(schema.privateFiles.ownerId, ownerId),
        eq(schema.privateFiles.purpose, purpose),
        eq(schema.privateFiles.state, "ready"),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
