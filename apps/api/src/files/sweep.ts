import type { Cell, CellTransaction } from "@faridalms/database/context";

import { withPurpose } from "@faridalms/database/context";
import {
  abandonUploads,
  retireStreams,
  retireTrashedFiles,
  retireTrashedMedia,
  retireUnlinkedFiles,
  streamMeasured,
  unmeasuredStreams,
} from "@faridalms/database/stores/files";
import { retirePreviews } from "@faridalms/database/stores/previews";
import {
  ABANDONED_UPLOAD_MS,
  FILE_GATES,
  TRASHED_MEDIA_MS,
  UNLINKED_FILE_MS,
} from "@faridalms/domain/file";

import type { ModuleContributions } from "../core/extension";
import type { FileStore } from "./store";

import { everyContribution, point } from "../core/extension";
import { backfillPreviews } from "./previews";

/**
 * Files a module lets go of in the sweep: coding projects saved over
 * since, say. Returns the keys of bytes no file holds any more.
 */
export interface FileSweep {
  retire(
    tx: CellTransaction,
    tenantId: string,
    input: { now: Date; limit: number },
  ): Promise<string[]>;
}

export const fileSweeps = point<FileSweep>("file sweeps");

/**
 * One pass over a tenant's files as the worker: uploads never finished are
 * rejected and their bytes dropped, verified files nothing linked within
 * their window are tombstoned, media out of every document, or deleted
 * from a file area, for the trash window is retired, and coding projects
 * saved over since are pruned to each student's last few saves. A video
 * that is gone, by this pass or any other way, loses the streams made from
 * it, and bytes no file holds any more lose their previews. Files a
 * special-category purpose hides are swept behind each purpose in turn.
 * Records change first and bytes second, so a failure in between leaves
 * stray bytes rather than a record pointing at nothing. Last, a few files
 * stored before previews were made on upload are cleaned and queued, and
 * a few videos streamed before the media service weighed its streams have
 * them weighed, so they count against the school's storage.
 */
export async function sweepTenantFiles(
  input: {
    cell: Cell;
    store: FileStore;
    extensions: readonly ModuleContributions[];
  },
  tenantId: string,
  now: Date,
  limit = 100,
) {
  const { cell, store } = input;
  const sweeps = everyContribution(input.extensions, fileSweeps);
  const unused = async (tx: CellTransaction) => ({
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
  });
  const keys = await cell.withWorker(
    {
      tenantId,
      requestId: crypto.randomUUID(),
      actor: { kind: "system" },
    },
    "write",
    async (tx) => {
      const open = await unused(tx);
      const gated = [];
      for (const gate of FILE_GATES)
        gated.push(await withPurpose(tx, gate, unused));
      return {
        abandoned: [
          ...open.abandoned,
          ...gated.flatMap((row) => row.abandoned),
        ],
        retired: [...open.retired, ...gated.flatMap((row) => row.retired)],
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
        superseded: (
          await Promise.all(
            sweeps.map((sweep) => sweep.retire(tx, tenantId, { now, limit })),
          )
        ).flat(),
        // Last, so a file retired in this pass loses what was made from it.
        streams: await retireStreams(tx, tenantId, limit),
        previews: await retirePreviews(tx, tenantId, limit),
      };
    },
  );
  for (const key of [
    ...keys.abandoned,
    ...keys.retired,
    ...keys.trashed,
    ...keys.superseded,
  ])
    await store.remove(key);
  // An upload given up part way leaves its parts behind as well.
  for (const key of keys.abandoned)
    await store.removeFolder(key.replace("/q/", "/u/"));
  for (const folder of [...keys.streams, ...keys.previews])
    await store.removeFolder(folder);
  const backfilled = await backfillPreviews(cell, store, tenantId, limit);
  const measured = await measureStreams(cell, store, tenantId, limit);
  return {
    abandoned: keys.abandoned.length,
    retired: keys.retired.length,
    trashed: keys.trashed.length,
    superseded: keys.superseded.length,
    streams: keys.streams.length,
    previews: keys.previews.length,
    backfilled,
    measured,
  };
}

async function measureStreams(
  cell: Cell,
  store: FileStore,
  tenantId: string,
  limit: number,
): Promise<number> {
  const work = () => ({
    tenantId,
    requestId: crypto.randomUUID(),
    actor: { kind: "system" as const },
  });
  const folders = await cell.withWorker(work(), "read", (tx) =>
    unmeasuredStreams(tx, tenantId, limit),
  );
  for (const folder of folders) {
    const bytes = await store.folderBytes(folder);
    await cell.withWorker(work(), "write", (tx) =>
      streamMeasured(tx, { tenantId, folder, bytes }),
    );
  }
  return folders.length;
}
