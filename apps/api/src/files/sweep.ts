import type { Cell } from "@faridalms/database/context";

import {
  abandonUploads,
  retireTrashedFiles,
  retireTrashedMedia,
  retireUnlinkedFiles,
} from "@faridalms/database/stores/files";
import {
  ABANDONED_UPLOAD_MS,
  TRASHED_MEDIA_MS,
  UNLINKED_FILE_MS,
} from "@faridalms/domain/file";

import type { FileStore } from "./store";

/**
 * One pass over a tenant's files as the worker: uploads never finished are
 * rejected and their bytes dropped, verified files nothing linked within
 * their window are tombstoned, and media out of every document, or deleted
 * from a file area, for the trash window is retired. Records change first and bytes second, so a
 * failure in between leaves stray bytes rather than a record pointing at
 * nothing.
 */
export async function sweepTenantFiles(
  cell: Cell,
  store: FileStore,
  tenantId: string,
  now: Date,
  limit = 100,
) {
  const keys = await cell.withWorker(
    {
      tenantId,
      requestId: crypto.randomUUID(),
      actor: { kind: "system" },
    },
    "write",
    async (tx) => ({
      abandoned: await abandonUploads(
        tx,
        tenantId,
        new Date(now.getTime() - ABANDONED_UPLOAD_MS),
        limit,
      ),
      retired: await retireUnlinkedFiles(
        tx,
        tenantId,
        new Date(now.getTime() - UNLINKED_FILE_MS),
        limit,
      ),
      trashed: [
        ...(await retireTrashedMedia(
          tx,
          tenantId,
          new Date(now.getTime() - TRASHED_MEDIA_MS),
          limit,
        )),
        ...(await retireTrashedFiles(
          tx,
          tenantId,
          new Date(now.getTime() - TRASHED_MEDIA_MS),
          limit,
        )),
      ],
    }),
  );
  for (const key of [...keys.abandoned, ...keys.retired, ...keys.trashed])
    await store.remove(key);
  return {
    abandoned: keys.abandoned.length,
    retired: keys.retired.length,
    trashed: keys.trashed.length,
  };
}
