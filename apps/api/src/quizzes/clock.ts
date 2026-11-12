import type { Cell } from "@faridalms/database/context";

import { writeAudit } from "@faridalms/database/audit";
import {
  assignmentById,
  studentWork,
  touchSubmission,
} from "@faridalms/database/stores/coursework";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  closeSitting,
  expiredSittings,
  sittingsOf,
} from "@faridalms/database/stores/quizzes";
import { isLate, QUIZ_GRACE_MS } from "@faridalms/domain/coursework";
import { schoolDate } from "@faridalms/domain/school";

import type { WorkerModules } from "../core/extension";
import type { ModuleWorker } from "../core/workers";

import { schoolsWith } from "../core/extension";
import { handInAttempt } from "./quiz";

/**
 * Hands in the timed attempts of one tenant whose time ran out with nobody
 * to hand them in, as the student's own hand-in would have when the clock
 * stopped: late only if that moment was past their due time.
 */
export async function handInTimedOut(
  cell: Cell,
  tenantId: string,
  now: Date,
  modules: WorkerModules,
  limit = 100,
): Promise<number> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      const schools = new Map(
        (await schoolsWith(modules, { tx, tenantId }, ["coursework"])).map(
          (scope) => [scope.schoolId, scope],
        ),
      );
      const expired = await expiredSittings(tx, {
        tenantId,
        orgIds: [...schools.keys()],
        before: new Date(now.getTime() - QUIZ_GRACE_MS),
        limit,
      });
      let handed = 0;
      for (const row of expired) {
        const [assignment, [work], sittings, school] = await Promise.all([
          assignmentById(tx, tenantId, row.assignmentId),
          studentWork(tx, {
            tenantId,
            assignmentId: row.assignmentId,
            studentId: row.studentId,
          }),
          sittingsOf(tx, { tenantId, submissionId: row.submissionId }),
          schoolProfile(tx, row.orgId),
        ]);
        const endsAt = sittings.get(row.attempt)?.endsAt ?? now;
        const scope = schools.get(row.orgId);
        // An attempt handed in another way, or work withdrawn since, only
        // has its clock stopped.
        const result =
          scope && assignment && work && work.attempts + 1 === row.attempt
            ? await handInAttempt(
                {
                  ...scope,
                  today: schoolDate(school?.timeZone ?? "UTC", endsAt),
                },
                {
                  assignment,
                  submissionId: row.submissionId,
                  studentId: row.studentId,
                  attempt: row.attempt,
                  isLate: isLate(work.dueAt, endsAt),
                },
              )
            : null;
        if (!result || !work?.submissionVersion) {
          await closeSitting(tx, {
            tenantId,
            submissionId: row.submissionId,
            attempt: row.attempt,
          });
          continue;
        }
        await touchSubmission(tx, {
          tenantId,
          id: row.submissionId,
          expectedVersion: work.submissionVersion,
          state: result.returned ? "returned" : "submitted",
          needsRevision: false,
        });
        await writeAudit(tx, tenantId, {
          action: "submission.hand_in",
          objectType: "submission",
          objectId: row.submissionId,
          orgId: row.orgId,
          studentUserId: row.studentId,
          details: {
            assignmentId: row.assignmentId,
            attempt: row.attempt,
            quiz: true,
            timeUp: true,
          },
        });
        handed += 1;
      }
      return handed;
    },
  );
}

/**
 * Hands in timed attempts whose time ran out, tenant by tenant on a timer.
 * Each pass waits for the previous one, and one tenant's failure is logged
 * without stopping the rest.
 */
export const QUIZ_CLOCK: ModuleWorker = {
  module: "coursework",
  name: "quiz.clock",
  start: (deps) => {
    let stopped = false;
    let running: Promise<void> | null = null;
    const modules = { directory: deps.directory, extensions: deps.extensions };
    const pass = async () => {
      const tenants = await deps.directory.tenantsOfCell(deps.cellId);
      for (const tenantId of tenants) {
        if (stopped) return;
        try {
          await handInTimedOut(deps.cell, tenantId, new Date(), modules);
        } catch (error) {
          console.error(
            JSON.stringify({
              worker: "quiz-clock",
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
            JSON.stringify({ worker: "quiz-clock", error: String(error) }),
          ),
        )
        .finally(() => {
          running = null;
        });
    }, 30_000);
    return async () => {
      stopped = true;
      clearInterval(timer);
      await running;
    };
  },
};
