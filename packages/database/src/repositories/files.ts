import type { FilePurpose, FileRejection } from "@faridalms/domain/file";

import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

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

export async function initiateFile(
  db: Executor,
  values: {
    id: string;
    ownerId: string;
    purpose: FilePurpose;
    name: string;
    mediaType: string;
    sizeBytes: number;
    storageKey: string;
  },
) {
  const [row] = await db.insert(schema.privateFiles).values(values).returning();
  if (!row) throw new Error("file.initiate_failed");
  return row;
}

/** Marks an initiated upload ready once the server has verified the bytes. */
export async function completeFile(
  db: Executor,
  id: string,
  ownerId: string,
  verified: { sha256: string; sizeBytes: number; scannedAt: Date | null },
) {
  const [row] = await db
    .update(schema.privateFiles)
    .set({
      sha256: verified.sha256,
      sizeBytes: verified.sizeBytes,
      scannedAt: verified.scannedAt,
      state: "ready",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.privateFiles.id, id),
        eq(schema.privateFiles.ownerId, ownerId),
        eq(schema.privateFiles.state, "initiated"),
      ),
    )
    .returning();
  return row;
}

export async function rejectFile(
  db: Executor,
  id: string,
  ownerId: string,
  reason: FileRejection,
) {
  await db
    .update(schema.privateFiles)
    .set({ state: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(schema.privateFiles.id, id),
        eq(schema.privateFiles.ownerId, ownerId),
        eq(schema.privateFiles.state, "initiated"),
      ),
    );
}

export async function pendingFile(db: Executor, id: string, ownerId: string) {
  return db.query.privateFiles.findFirst({
    where: { id, ownerId, state: "initiated" },
  });
}

/** Ready files the owner may attach for a purpose, in the requested order. */
export async function ownedReadyFiles(
  db: Executor,
  ownerId: string,
  ids: string[],
  purpose: FilePurpose,
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

/**
 * A file with every record that links it, so a download can be authorised by
 * the assignment or submission it belongs to rather than by knowing the id.
 */
export async function fileWithLinks(db: Executor, id: string) {
  return db.query.privateFiles.findFirst({
    where: { id },
    with: {
      lessonLinks: {
        with: {
          lesson: {
            columns: { id: true },
            with: {
              module: {
                columns: { id: true, classId: true, status: true },
              },
            },
          },
        },
      },
      resourceLinks: {
        with: {
          assignment: {
            columns: {
              id: true,
              classId: true,
              subjectId: true,
              status: true,
              authorId: true,
            },
          },
        },
      },
      attemptLinks: {
        with: {
          attempt: {
            columns: { id: true },
            with: {
              submission: {
                columns: { id: true, studentId: true, assignmentId: true },
                with: {
                  assignment: {
                    columns: { id: true, classId: true, subjectId: true },
                  },
                },
              },
            },
          },
        },
      },
      draftLinks: {
        with: {
          submission: {
            columns: { id: true, studentId: true, assignmentId: true },
            with: {
              assignment: {
                columns: { id: true, classId: true, subjectId: true },
              },
            },
          },
        },
      },
      messageLinks: {
        with: {
          message: {
            columns: { id: true, senderId: true },
            with: { recipients: { columns: { recipientId: true } } },
          },
        },
      },
    },
  });
}

interface Reference {
  table: string;
  column: string;
}

/**
 * Every place a file id can live, read from the catalogue rather than listed
 * by hand: foreign keys to this table, and every json column, since page and
 * lesson documents carry media ids inside them. A new table or document type
 * therefore keeps its files without anyone remembering to register it.
 */
async function referenceSites(db: Executor) {
  const foreign = (await db.execute(sql`
    select cl.relname as "table", a.attname as "column"
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'private_files'::regclass
  `)) as unknown as Reference[];
  const documents = (await db.execute(sql`
    select table_name as "table", column_name as "column"
    from information_schema.columns
    where table_schema = current_schema() and data_type in ('json', 'jsonb')
  `)) as unknown as Reference[];
  return { foreign, documents };
}

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The ids among `ids` that a record or a stored document still points at. */
export async function referencedFileIds(
  db: Executor,
  ids: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  const { foreign, documents } = await referenceSites(db);
  for (const { table, column } of foreign) {
    const rows = (await db.execute(sql`
      select distinct ${sql.identifier(column)}::text as id
      from ${sql.identifier(table)}
      where ${sql.identifier(column)} in ${ids}
    `)) as unknown as { id: string }[];
    for (const row of rows) found.add(row.id);
  }
  for (const { table, column } of documents) {
    const rows = (await db.execute(sql`
      select distinct m[1] as id
      from ${sql.identifier(table)} t
      cross join lateral regexp_matches(t.${sql.identifier(column)}::text, ${UUID_PATTERN}, 'g') as m
      where m[1] in ${ids}
    `)) as unknown as { id: string }[];
    for (const row of rows) found.add(row.id);
  }
  return found;
}

/** Uploads that were started before `before` and never finished. */
export function abandonedUploads(db: Executor, before: Date, limit: number) {
  return db
    .select({
      id: schema.privateFiles.id,
      storageKey: schema.privateFiles.storageKey,
    })
    .from(schema.privateFiles)
    .where(
      and(
        eq(schema.privateFiles.state, "initiated"),
        lt(schema.privateFiles.createdAt, before),
      ),
    )
    .orderBy(asc(schema.privateFiles.createdAt))
    .limit(limit);
}

export async function abandonUpload(db: Executor, id: string) {
  const [row] = await db
    .update(schema.privateFiles)
    .set({
      state: "rejected",
      rejectionReason: "abandoned",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.privateFiles.id, id),
        eq(schema.privateFiles.state, "initiated"),
      ),
    )
    .returning({ storageKey: schema.privateFiles.storageKey });
  return row;
}

/**
 * Verified files no record has linked since `readyBefore`, and rejected
 * uploads older than `rejectedBefore`. Foreign keys are excluded here; stored
 * documents are checked by `referencedFileIds` before anything is removed.
 */
export async function expiredFileCandidates(
  db: Executor,
  cutoffs: { readyBefore: Date; rejectedBefore: Date },
  limit: number,
) {
  const { foreign } = await referenceSites(db);
  const unlinked = foreign.map(
    ({ table, column }) =>
      sql`not exists (select 1 from ${sql.identifier(table)} r where r.${sql.identifier(column)} = f.id)`,
  );
  return (await db.execute(sql`
    select f.id, f.storage_key as "storageKey", f.state
    from private_files f
    where ((f.state = 'ready' and f.completed_at < ${cutoffs.readyBefore.toISOString()}::timestamptz)
      or (f.state = 'rejected' and f.updated_at < ${cutoffs.rejectedBefore.toISOString()}::timestamptz))
      ${unlinked.length > 0 ? sql`and ${sql.join(unlinked, sql` and `)}` : sql``}
    order by f.updated_at, f.id
    limit ${limit}
  `)) as unknown as { id: string; storageKey: string; state: string }[];
}

/**
 * Deletes a file record once nothing refers to it, holding the row lock so a
 * save that links it concurrently either finishes first and keeps the file,
 * or waits and then fails its foreign key rather than losing its link.
 */
export async function removeUnreferencedFile(db: Database, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: schema.privateFiles.id,
        storageKey: schema.privateFiles.storageKey,
      })
      .from(schema.privateFiles)
      .where(
        and(
          eq(schema.privateFiles.id, id),
          inArray(schema.privateFiles.state, ["ready", "rejected"]),
        ),
      )
      .for("update", { skipLocked: true });
    if (!row) return null;
    if ((await referencedFileIds(tx, [id])).has(id)) return null;
    await tx.delete(schema.privateFiles).where(eq(schema.privateFiles.id, id));
    return row;
  });
}
