import type { PeerReviewSettings } from "@faridalms/domain/peer-review";

import {
  attemptUnderReview,
  keepPeerSettings,
  peerSettingsOf,
  reviewsAttempt,
} from "@faridalms/database/stores/peer-reviews";
import { peerIssue, peerReviewSchema } from "@faridalms/domain/peer-review";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { can } from "../core/procedure";
import {
  assignmentParts,
  attemptHolds,
  attemptReaders,
} from "../coursework/points";
import { reviewerReads } from "./work";

/**
 * Peer review as the assignment editor sends it: empty for none, or its
 * settings written out.
 */
function settingsOfValue(value: unknown): PeerReviewSettings | null {
  if (value === "" || value === null) return null;
  let read: unknown = value;
  if (typeof value === "string")
    try {
      read = JSON.parse(value);
    } catch {
      throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
    }
  const parsed = v.safeParse(peerReviewSchema, read);
  if (!parsed.success)
    throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
  return parsed.output;
}

async function storedOf(context: UnitContext, assignmentId: string) {
  return (
    (
      await peerSettingsOf(context.tx, {
        tenantId: context.tenantId,
        assignmentIds: [assignmentId],
      })
    ).get(assignmentId) ?? null
  );
}

const kept = (settings: {
  reviews: number;
  anonymous: boolean;
  dueAt: string | null;
}) => ({
  reviews: settings.reviews,
  anonymous: settings.anonymous,
  dueAt: settings.dueAt,
});

/** What peer review adds to coursework: its settings on the work, and who reads and keeps an attempt. */
export const PEER_REVIEW: ModuleContributions = {
  module: "peer_review",
  contributions: [
    contribute(assignmentParts, {
      key: "peer",
      async prepare(context, input) {
        const stored = input.stored
          ? await storedOf(context, input.stored.id)
          : null;
        const asked =
          input.value === undefined
            ? stored && {
                reviews: stored.reviews,
                anonymous: stored.anonymous,
                dueAt: stored.dueAt ?? "",
              }
            : settingsOfValue(input.value);
        // Handed-out reviews belong to the work, so peer review stays on.
        if (!asked && stored?.startedAt)
          throw new ORPCError("CONFLICT", {
            message: "coursework.peer_started",
          });
        const issue = asked
          ? peerIssue({
              settings: asked,
              format: input.format,
              workDueAt: input.dueAt,
            })
          : null;
        if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
        return null;
      },
      async save(context, input) {
        if (input.value === undefined) return;
        const settings = settingsOfValue(input.value);
        await keepPeerSettings(context.tx, {
          tenantId: context.tenantId,
          assignmentId: input.assignment.id,
          settings: settings && {
            reviews: settings.reviews,
            anonymous: settings.anonymous,
            dueAt: settings.dueAt || null,
          },
        });
      },
      async reused(context, input) {
        const stored = await storedOf(context, input.source.id);
        if (stored)
          await keepPeerSettings(context.tx, {
            tenantId: context.tenantId,
            assignmentId: input.created.id,
            settings: { ...kept(stored), dueAt: null },
          });
      },
      async follows(context, input) {
        const stored = await storedOf(context, input.lead.id);
        const own = await storedOf(context, input.part.id);
        // A part whose reviews were handed out keeps them.
        if (!stored && own?.startedAt) return;
        await keepPeerSettings(context.tx, {
          tenantId: context.tenantId,
          assignmentId: input.part.id,
          settings: stored && kept(stored),
        });
      },
    }),
    contribute(attemptReaders, {
      reads: async (context, attempt) =>
        can(context, "own-work:submit") &&
        reviewsAttempt(context.tx, {
          tenantId: context.tenantId,
          attemptId: attempt.attemptId,
          reviewerId: context.actor.userId,
        }),
      readsFile: (context, input) =>
        reviewerReads(context, input.submissionId, input.fileId),
    }),
    contribute(attemptHolds, {
      heldBecause: async (context, attemptId) =>
        (await attemptUnderReview(context.tx, context.tenantId, attemptId))
          ? "coursework.peer_handed_out"
          : null,
    }),
  ],
};
