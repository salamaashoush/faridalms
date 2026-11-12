import type { Cell } from "@faridalms/database/context";

import { assignmentById } from "@faridalms/database/stores/coursework";
import {
  markPeerReminded,
  peerReviewsDueSoon,
} from "@faridalms/database/stores/peer-reviews";

import type { UnitContext } from "../core/context";
import type { WorkerModules } from "../core/extension";
import type { ModuleWorker } from "../core/workers";

import { schoolsWith } from "../core/extension";
import { everyTenant } from "../files/upkeep";
import { tellReviewers } from "./notices";

/** How long before a review date the reviewers still writing hear of it. */
export const PEER_REMINDER_HOURS = 24;

/**
 * Reminds one tenant's reviewers whose reviews fall due within a day and
 * are not all sent, once a review date, as the school with nobody the
 * actor, at the schools that have peer review on. Answers how many
 * assignments' reviewers were reminded.
 */
export async function remindPeerReviews(
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
      const schools = new Map(
        (
          await schoolsWith(input.modules, { tx, tenantId }, ["peer_review"])
        ).map((scope) => [scope.schoolId, scope]),
      );
      const due = await peerReviewsDueSoon(tx, {
        tenantId,
        orgIds: [...schools.keys()],
        now: input.now,
        withinHours: PEER_REMINDER_HOURS,
        limit: input.limit ?? 100,
      });
      for (const row of due) {
        const assignment = await assignmentById(tx, tenantId, row.id);
        const scope = schools.get(row.orgId);
        if (assignment && scope)
          await tellReviewers(
            {
              ...scope,
              actorUserId: null,
              now: input.now,
              channels: input.channels,
            },
            assignment,
            row.peerDueAt,
            row.reviewerIds,
            "due_soon",
          );
        await markPeerReminded(tx, { tenantId, assignmentId: row.id });
      }
      return due.length;
    },
  );
}

/** The review-date reminders, run over every tenant of the cell on a timer. */
export const PEER_REVIEW_CLOCK: ModuleWorker = {
  module: "peer_review",
  name: "peer_review.clock",
  start: (deps) =>
    everyTenant({
      name: "peer_review.clock",
      directory: deps.directory,
      cellId: deps.cellId,
      intervalMs: 5 * 60_000,
      run: async (tenantId) => {
        await remindPeerReviews(deps.cell, tenantId, {
          now: new Date(),
          channels: deps.channels,
          modules: { directory: deps.directory, extensions: deps.extensions },
        });
      },
    }),
};
