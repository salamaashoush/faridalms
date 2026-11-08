import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";

import { assignmentById } from "@faridalms/database/stores/coursework";
import {
  markPeerReminded,
  peerReviewsDueSoon,
} from "@faridalms/database/stores/peer-reviews";

import type { UnitContext } from "./context";

import { everyTenant } from "../files/upkeep";
import { tellReviewers } from "./teaching-notices";

/** How long before a review date the reviewers still writing hear of it. */
export const PEER_REMINDER_HOURS = 24;

/**
 * Reminds one tenant's reviewers whose reviews fall due within a day and
 * are not all sent, once a review date, as the school with nobody the
 * actor. Answers how many assignments' reviewers were reminded.
 */
export async function remindPeerReviews(
  cell: Cell,
  tenantId: string,
  input: { now: Date; channels: UnitContext["channels"]; limit?: number },
): Promise<number> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      const due = await peerReviewsDueSoon(tx, {
        tenantId,
        now: input.now,
        withinHours: PEER_REMINDER_HOURS,
        limit: input.limit ?? 100,
      });
      for (const row of due) {
        const assignment = await assignmentById(tx, tenantId, row.id);
        if (assignment)
          await tellReviewers(
            {
              tx,
              tenantId,
              schoolId: row.orgId,
              actorUserId: null,
              now: input.now,
              channels: input.channels,
            },
            assignment,
            row.reviewerIds,
            "reminder",
          );
        await markPeerReminded(tx, { tenantId, assignmentId: row.id });
      }
      return due.length;
    },
  );
}

/** Runs the review-date reminders over every tenant of the cell on a timer. */
export function startPeerReviewClock(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  channels: UnitContext["channels"];
  intervalMs: number;
}): () => Promise<void> {
  return everyTenant({
    name: "peer_review.clock",
    directory: input.directory,
    cellId: input.cellId,
    intervalMs: input.intervalMs,
    run: async (tenantId) => {
      await remindPeerReviews(input.cell, tenantId, {
        now: new Date(),
        channels: input.channels,
      });
    },
  });
}
