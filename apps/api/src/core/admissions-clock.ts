import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";

import { clockDue } from "@faridalms/database/stores/admission-decisions";
import { schoolProfile } from "@faridalms/database/stores/identity";

import type { UnitContext } from "./context";
import type { AdmissionScope } from "./decisions";

import { everyTenant } from "../files/upkeep";
import {
  applicationIn,
  intakeIn,
  moveApplication,
  releaseDecisions,
} from "./decisions";
import { dateIn } from "./procedure";

/**
 * Does what the calendar asks of one tenant's admissions: decisions whose
 * intake's day has come at their school are released to the families, and
 * offers past their last day lapse. Each runs as the school's clock, with
 * nobody the actor. Answers how many applications moved.
 */
export async function runAdmissionsClock(
  cell: Cell,
  tenantId: string,
  input: { now: Date; channels: UnitContext["channels"]; limit?: number },
): Promise<number> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      const due = await clockDue(tx, {
        tenantId,
        now: input.now,
        limit: input.limit ?? 200,
      });
      const schools = new Set([
        ...due.releases.map((row) => row.orgId),
        ...due.lapsed.map((row) => row.orgId),
      ]);
      let moved = 0;
      for (const schoolId of schools) {
        const school = await schoolProfile(tx, schoolId);
        const scope: AdmissionScope = {
          tx,
          tenantId,
          schoolId,
          actorUserId: null,
          now: input.now,
          channels: input.channels,
          today: dateIn(school?.timeZone ?? "UTC", input.now),
        };
        const releases = [];
        for (const release of due.releases.filter(
          (row) => row.orgId === schoolId,
        )) {
          const row = await applicationIn(scope, release.id);
          if (row) releases.push({ row, expectedVersion: null });
        }
        moved += (await releaseDecisions(scope, releases, "clock")).released
          .length;
        for (const lapsed of due.lapsed.filter(
          (row) => row.orgId === schoolId,
        )) {
          const row = await applicationIn(scope, lapsed.id);
          const intake = row ? await intakeIn(scope, row.intakeId) : null;
          if (!row || !intake || row.state !== "offered") continue;
          if (
            (await moveApplication(scope, {
              row,
              intake,
              to: "offer_expired",
              expectedVersion: null,
              details: { by: "clock" },
            })) !== null
          )
            moved += 1;
        }
      }
      return moved;
    },
  );
}

/** Runs the admissions clock over every tenant of the cell on a timer. */
export function startAdmissionsClock(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  channels: UnitContext["channels"];
  intervalMs: number;
}): () => Promise<void> {
  return everyTenant({
    name: "admissions.clock",
    directory: input.directory,
    cellId: input.cellId,
    intervalMs: input.intervalMs,
    run: async (tenantId) => {
      await runAdmissionsClock(input.cell, tenantId, {
        now: new Date(),
        channels: input.channels,
      });
    },
  });
}
