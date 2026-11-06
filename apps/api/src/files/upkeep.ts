import type { Cell } from "@faridalms/database/context";
import type {
  Directory,
  DirectorySync,
} from "@faridalms/database/directory/client";

import {
  schoolCounts,
  schoolSends,
  schoolStorage,
  streamedVideoMs,
} from "@faridalms/database/stores/files";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  failedDeliveriesSince,
  onboardingSeen,
  schoolDaysLastWeek,
} from "@faridalms/database/stores/onboarding";
import { addDays, schoolDate, zonedInstant } from "@faridalms/domain/school";

import type { FileStore } from "./store";

import { sweepTenantFiles } from "./sweep";

/**
 * Runs a pass over every tenant of the cell on a timer. Each pass waits for
 * the previous one, and one tenant's failure is logged without stopping the
 * rest.
 */
export function everyTenant(input: {
  name: string;
  directory: Directory;
  cellId: string;
  intervalMs: number;
  run: (tenantId: string) => Promise<void>;
}): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | null = null;
  const pass = async () => {
    for (const tenantId of await input.directory.tenantsOfCell(input.cellId)) {
      if (stopped) return;
      try {
        await input.run(tenantId);
      } catch (error) {
        console.error(
          JSON.stringify({
            worker: input.name,
            tenantId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  };
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = pass()
      .catch((error: unknown) =>
        console.error(
          JSON.stringify({ worker: input.name, error: String(error) }),
        ),
      )
      .finally(() => {
        running = null;
      });
  }, input.intervalMs);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}

/**
 * Measures each of a tenant's schools and reports it to the directory: its
 * storage and counts, its week of school days and failed deliveries, and
 * the onboarding steps it has taken.
 */
export async function reportTenantUsage(
  cell: Cell,
  directory: Directory,
  sync: DirectorySync,
  tenantId: string,
) {
  const schools = await directory.schoolsOfTenant(tenantId);
  const rows = await cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "read",
    async (tx) => {
      const measured = [];
      const now = new Date();
      for (const school of schools) {
        const profile = await schoolProfile(tx, school.schoolId);
        const zone = profile?.timeZone ?? "UTC";
        const today = schoolDate(zone, now);
        const sends = (from: string, until: Date) =>
          schoolSends(tx, {
            tenantId,
            orgId: school.schoolId,
            from: zonedInstant(from, "00:00", zone),
            until,
          });
        // Yesterday's row is counted again so its last minutes are not lost.
        const days = [];
        for (const day of [addDays(today, -1), today]) {
          const end = zonedInstant(addDays(day, 1), "00:00", zone);
          days.push({
            day,
            ...(await sends(day, end < now ? end : now)),
          });
        }
        measured.push({
          schoolId: school.schoolId,
          ...(await schoolStorage(tx, tenantId, school.schoolId)),
          ...(await schoolCounts(tx, {
            tenantId,
            orgId: school.schoolId,
            today: schoolDate(profile?.timeZone ?? "UTC", now),
            now,
          })),
          videoMinutes: Math.floor(
            (await streamedVideoMs(tx, tenantId, school.schoolId)) / 60_000,
          ),
          emailsThisMonth: (await sends(`${today.slice(0, 8)}01`, now)).emails,
          days,
          schoolDays7d: await schoolDaysLastWeek(tx, {
            tenantId,
            orgId: school.schoolId,
            today,
          }),
          failedDeliveries1d: await failedDeliveriesSince(tx, {
            tenantId,
            orgId: school.schoolId,
            since: new Date(now.getTime() - 86_400_000),
          }),
          reached: await onboardingSeen(tx, {
            tenantId,
            orgId: school.schoolId,
            today,
          }),
        });
      }
      return measured;
    },
  );
  await sync.reportUsage(rows, new Date());
}

/**
 * Keeps the cell's files in order: the sweep drops abandoned uploads, files
 * nothing used and the trash past its window, and, when the cell may write
 * to the directory, each school's storage is reported there for the
 * operator console.
 */
export function startFileUpkeep(input: {
  cell: Cell;
  directory: Directory;
  sync: DirectorySync | null;
  cellId: string;
  store: FileStore;
  sweepMs: number;
  reportMs: number;
}): () => Promise<void> {
  const stops = [
    everyTenant({
      name: "files.sweep",
      directory: input.directory,
      cellId: input.cellId,
      intervalMs: input.sweepMs,
      run: async (tenantId) => {
        await sweepTenantFiles(input.cell, input.store, tenantId, new Date());
      },
    }),
  ];
  const sync = input.sync;
  if (sync)
    stops.push(
      everyTenant({
        name: "files.usage",
        directory: input.directory,
        cellId: input.cellId,
        intervalMs: input.reportMs,
        run: (tenantId) =>
          reportTenantUsage(input.cell, input.directory, sync, tenantId),
      }),
    );
  return async () => {
    await Promise.all(stops.map((stop) => stop()));
  };
}
