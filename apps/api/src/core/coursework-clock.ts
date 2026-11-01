import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";

import { openedUntold } from "@faridalms/database/stores/coursework";
import { schoolDate } from "@faridalms/domain/school";

import type { UnitContext } from "./context";

import { everyTenant } from "../files/upkeep";
import { schoolZone } from "./procedure";
import { tellAssigned } from "./teaching-notices";

/**
 * Tells the students of one tenant, and their families, about work that was
 * assigned to open later and has now opened, as its teacher would have been
 * heard on assigning it. Answers how many pieces of work were told.
 */
export async function tellOpenedWork(
  cell: Cell,
  tenantId: string,
  input: { now: Date; channels: UnitContext["channels"]; limit?: number },
): Promise<number> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      const opened = await openedUntold(tx, {
        tenantId,
        now: input.now,
        limit: input.limit ?? 100,
      });
      await Promise.all(
        opened.map(async (assignment) =>
          tellAssigned(
            {
              tx,
              tenantId,
              schoolId: assignment.orgId,
              actorUserId: assignment.authorUserId,
              now: input.now,
              channels: input.channels,
              today: schoolDate(
                await schoolZone(tx, assignment.orgId),
                input.now,
              ),
            },
            assignment,
          ),
        ),
      );
      return opened.length;
    },
  );
}

/** Runs the coursework clock over every tenant of the cell on a timer. */
export function startCourseworkClock(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  channels: UnitContext["channels"];
  intervalMs: number;
}): () => Promise<void> {
  return everyTenant({
    name: "coursework.clock",
    directory: input.directory,
    cellId: input.cellId,
    intervalMs: input.intervalMs,
    run: async (tenantId) => {
      await tellOpenedWork(input.cell, tenantId, {
        now: new Date(),
        channels: input.channels,
      });
    },
  });
}
