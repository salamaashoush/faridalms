import type { Database } from "@faridalms/database";
import type { ControlDatabase } from "@faridalms/database/control";

import { schools } from "@faridalms/database/control-schema";
import {
  abandonedUploads,
  abandonUpload,
  expiredFileCandidates,
  referencedFileIds,
  removeUnreferencedFile,
} from "@faridalms/database/repositories/files";
import {
  ABANDONED_UPLOAD_MS,
  REJECTED_FILE_MS,
  UNLINKED_FILE_MS,
} from "@faridalms/domain/file";
import { eq } from "drizzle-orm";

import type { TenantPools } from "../tenancy";
import type { FileStore } from "./store";

/**
 * One pass over a school's files: uploads never finished are rejected and
 * their bytes dropped, and files nothing refers to after their retention
 * window lose their record first and their bytes second, so a failure in
 * between leaves stray bytes rather than a record pointing at nothing.
 */
export async function sweepSchoolFiles(
  db: Database,
  store: FileStore,
  now: Date,
  limit = 100,
) {
  let abandoned = 0;
  for (const file of await abandonedUploads(
    db,
    new Date(now.getTime() - ABANDONED_UPLOAD_MS),
    limit,
  )) {
    if (!(await abandonUpload(db, file.id))) continue;
    await store.remove(file.storageKey);
    abandoned += 1;
  }
  const candidates = await expiredFileCandidates(
    db,
    {
      readyBefore: new Date(now.getTime() - UNLINKED_FILE_MS),
      rejectedBefore: new Date(now.getTime() - REJECTED_FILE_MS),
    },
    limit * 10,
  );
  const referenced = await referencedFileIds(
    db,
    candidates.map((file) => file.id),
  );
  let removed = 0;
  for (const file of candidates) {
    if (removed >= limit) break;
    if (referenced.has(file.id)) continue;
    const row = await removeUnreferencedFile(db, file.id);
    if (!row) continue;
    await store.remove(row.storageKey);
    removed += 1;
  }
  return { abandoned, removed };
}

/** Runs the sweep for every active school on an interval, one school at a time. */
export class FileSweeper {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly control: ControlDatabase,
    private readonly pools: TenantPools,
    private readonly store: FileStore,
    private readonly intervalMs: number,
  ) {}

  start() {
    this.schedule(this.intervalMs);
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running)
      await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delay);
  }

  async tick() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const active = await this.control
        .select()
        .from(schools)
        .where(eq(schools.isActive, true));
      for (const school of active) {
        const lease = await this.pools.acquire(school);
        try {
          const result = await sweepSchoolFiles(
            lease.db,
            this.store,
            new Date(),
          );
          if (result.abandoned > 0 || result.removed > 0)
            console.info(
              JSON.stringify({
                worker: "files",
                school: school.slug,
                ...result,
              }),
            );
        } finally {
          lease.release();
        }
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "files",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      this.running = false;
      this.schedule(this.intervalMs);
    }
  }
}
