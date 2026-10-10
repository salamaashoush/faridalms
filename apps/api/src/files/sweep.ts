import type { Cell } from "@faridalms/database/context";

import {
  abandonUploads,
  retireStreams,
  retireSupersededAnswers,
  retireTrashedFiles,
  retireTrashedMedia,
  retireUnlinkedFiles,
} from "@faridalms/database/stores/files";
import {
  ABANDONED_UPLOAD_MS,
  SAVES_KEPT,
  SUPERSEDED_SAVE_MS,
  TRASHED_MEDIA_MS,
  UNLINKED_FILE_MS,
} from "@faridalms/domain/file";

import type { FileStore } from "./store";

/**
 * One pass over a tenant's files as the worker: uploads never finished are
 * rejected and their bytes dropped, verified files nothing linked within
 * their window are tombstoned, media out of every document, or deleted
 * from a file area, for the trash window is retired, and coding projects
 * saved over since are pruned to each student's last few saves. A video
 * that is gone, by this pass or any other way, loses the streams made from
 * it. Records change first and bytes second, so a failure in between leaves
 * stray bytes rather than a record pointing at nothing.
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
      superseded: await retireSupersededAnswers(tx, tenantId, {
        kept: SAVES_KEPT,
        savedBefore: new Date(now.getTime() - SUPERSEDED_SAVE_MS),
        limit,
      }),
      // Last, so a video retired in this pass loses its streams with it.
      streams: await retireStreams(tx, tenantId, limit),
    }),
  );
  for (const key of [
    ...keys.abandoned,
    ...keys.retired,
    ...keys.trashed,
    ...keys.superseded,
  ])
    await store.remove(key);
  for (const folder of keys.streams) await store.removeStreams(folder);
  return {
    abandoned: keys.abandoned.length,
    retired: keys.retired.length,
    trashed: keys.trashed.length,
    superseded: keys.superseded.length,
    streams: keys.streams.length,
  };
}
