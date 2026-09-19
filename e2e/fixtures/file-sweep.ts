import { createDatabase } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import {
  abandonedUploads,
  abandonUpload,
  expiredFileCandidates,
  referencedFileIds,
  removeUnreferencedFile,
} from "@faridalms/database/repositories/files";
import { eq } from "drizzle-orm";

import { DiskFileStore } from "../../apps/api/src/files/store";
import { sweepSchoolFiles } from "../../apps/api/src/files/sweep";

/**
 * Runs the sweep's queries with a clock a month ahead, but acts only on the
 * ids the calling test created: other tests share this database and their
 * uploads in flight must not be swept from under them.
 */
const ids = JSON.parse(process.argv[2] ?? "{}") as {
  abandoned: string;
  orphan: string;
  linked: string;
  document: string;
};
const controlUrl = process.env.CONTROL_DATABASE_URL;
if (
  !controlUrl ||
  !/^\/northwind_test_control_[a-z0-9]+$/.test(new URL(controlUrl).pathname)
) {
  throw new Error("File sweep fixtures require an isolated test database");
}
const control = createControlDatabase(controlUrl);
try {
  const [school] = await control
    .select()
    .from(schools)
    .where(eq(schools.slug, "northwind"));
  if (
    !school ||
    !/^\/northwind_test_northwind_[a-z0-9]+$/.test(new URL(school.databaseUrl).pathname)
  ) {
    throw new Error("File sweep fixtures require an isolated school");
  }
  const db = createDatabase(school.databaseUrl);
  const store = new DiskFileStore(
    process.env.FILE_STORAGE_DIR ?? ".data/files",
  );
  try {
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const abandonedFound = (await abandonedUploads(db, later, 100_000)).some(
      (row) => row.id === ids.abandoned,
    );
    const abandoned = await abandonUpload(db, ids.abandoned);
    if (abandoned) await store.remove(abandoned.storageKey);
    const abandonedRow = await db.query.privateFiles.findFirst({
      where: { id: ids.abandoned },
      columns: { state: true, rejectionReason: true },
    });
    const candidates = new Set(
      (
        await expiredFileCandidates(
          db,
          { readyBefore: later, rejectedBefore: later },
          100_000,
        )
      ).map((row) => row.id),
    );
    const referenced = await referencedFileIds(db, [
      ids.orphan,
      ids.linked,
      ids.document,
    ]);
    const orphan = await removeUnreferencedFile(db, ids.orphan);
    if (orphan) await store.remove(orphan.storageKey);
    const documentRemoved = await removeUnreferencedFile(db, ids.document);
    const sweep = await sweepSchoolFiles(db, store, new Date());
    const orphanRow = await db.query.privateFiles.findFirst({
      where: { id: ids.orphan },
      columns: { id: true },
    });
    console.log(
      JSON.stringify({
        abandonedFound,
        abandonedState: abandonedRow,
        candidates: {
          orphan: candidates.has(ids.orphan),
          linked: candidates.has(ids.linked),
          document: candidates.has(ids.document),
        },
        referenced: [...referenced].toSorted(),
        orphanRemoved: Boolean(orphan) && !orphanRow,
        documentRemoved: Boolean(documentRemoved),
        linkedKept: Boolean(
          await db.query.privateFiles.findFirst({
            where: { id: ids.linked, state: "ready" },
            columns: { id: true },
          }),
        ),
        sweep,
      }),
    );
  } finally {
    await db.$client.close();
  }
} finally {
  await control.$client.close();
}
