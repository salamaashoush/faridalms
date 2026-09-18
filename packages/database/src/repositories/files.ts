import type { FilePurpose } from "@faridalms/domain/file";

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
  verified: { sha256: string; sizeBytes: number },
) {
  const [row] = await db
    .update(schema.privateFiles)
    .set({
      sha256: verified.sha256,
      sizeBytes: verified.sizeBytes,
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

export async function rejectFile(db: Executor, id: string, ownerId: string) {
  await db
    .update(schema.privateFiles)
    .set({ state: "rejected", updatedAt: new Date() })
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
