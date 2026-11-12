import type { Cell } from "@faridalms/database/context";

import { clockDue } from "@faridalms/database/stores/admission-decisions";
import { schoolProfile } from "@faridalms/database/stores/identity";
import { schoolDate } from "@faridalms/domain/school";

import type { UnitContext } from "../core/context";
import type { WorkerModules } from "../core/extension";
import type { ModuleWorker } from "../core/workers";
import type { AdmissionScope } from "./decisions";

import { schoolsWith } from "../core/extension";
import { everyTenant } from "../files/upkeep";
import {
  applicationIn,
  intakeIn,
  moveApplication,
  releaseDecisions,
} from "./decisions";

/**
 * Does what the calendar asks of one tenant's admissions: decisions whose
 * intake's day has come at their school are released to the families, and
 * offers past their last day lapse. Each runs as the school's clock, with
 * nobody the actor. Answers how many applications moved.
 */
export async function runAdmissionsClock(
  cell: Cell,
  tenantId: string,
  input: {
    now: Date;
    channels: UnitContext["channels"];
    modules: WorkerModules;
    limit?: number;
  },
): Promise<number> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      const schools = await schoolsWith(input.modules, { tx, tenantId }, [
        "admissions",
      ]);
      const due = await clockDue(tx, {
        tenantId,
        orgIds: schools.map((scope) => scope.schoolId),
        now: input.now,
        limit: input.limit ?? 200,
      });
      const dueAt = new Set([
        ...due.releases.map((row) => row.orgId),
        ...due.lapsed.map((row) => row.orgId),
      ]);
      let moved = 0;
      for (const modules of schools) {
        const { schoolId } = modules;
        if (!dueAt.has(schoolId)) continue;
        const school = await schoolProfile(tx, schoolId);
        const scope: AdmissionScope = {
          ...modules,
          actorUserId: null,
          now: input.now,
          channels: input.channels,
          today: schoolDate(school?.timeZone ?? "UTC", input.now),
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

/**
 * Releases decisions on their intake's day and lapses offers after their
 * last one, at each school's own midnight, over every tenant on a timer.
 */
export const ADMISSIONS_CLOCK: ModuleWorker = {
  module: "admissions",
  name: "admissions.clock",
  start: (deps) =>
    everyTenant({
      name: "admissions.clock",
      directory: deps.directory,
      cellId: deps.cellId,
      intervalMs: 5 * 60_000,
      run: async (tenantId) => {
        await runAdmissionsClock(deps.cell, tenantId, {
          now: new Date(),
          channels: deps.channels,
          modules: { directory: deps.directory, extensions: deps.extensions },
        });
      },
    }),
};
