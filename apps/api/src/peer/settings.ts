import {
  assignmentById,
  isRecipient,
} from "@faridalms/database/stores/coursework";
import { peerSettingsOf } from "@faridalms/database/stores/peer-reviews";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { can, readProcedure, requireCapability } from "../core/procedure";
import { teaches as teachesClass } from "../core/reach";
import { taughtAssignment } from "../coursework/access";

const byAssignment = v.object({ assignmentId: v.pipe(v.string(), v.uuid()) });

/** How an assignment's work is reviewed, where it is. */
export async function settingsOf(context: UnitContext, assignmentId: string) {
  return (
    (
      await peerSettingsOf(context.tx, {
        tenantId: context.tenantId,
        assignmentIds: [assignmentId],
      })
    ).get(assignmentId) ?? null
  );
}

export /** An assignment whose work its classmates review, for its teacher. */
async function reviewedAssignment(context: UnitContext, assignmentId: string) {
  requireCapability(context, "submissions:grade");
  const assignment = await taughtAssignment(context, assignmentId);
  const peer = await settingsOf(context, assignment.id);
  if (!peer)
    throw new ORPCError("BAD_REQUEST", { message: "coursework.peer_off" });
  return { assignment, peer };
}

export /** An assignment the student was set, whose work classmates review. */
async function learnerReviewed(context: UnitContext, assignmentId: string) {
  requireCapability(context, "own-work:read");
  const assignment = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  const peer = assignment ? await settingsOf(context, assignment.id) : null;
  if (
    !assignment ||
    !peer ||
    assignment.state !== "published" ||
    !(await isRecipient(
      context.tx,
      context.tenantId,
      assignment.id,
      context.actor.userId,
    ))
  )
    throw new ORPCError("NOT_FOUND");
  return { assignment, peer };
}

/**
 * How an assignment's work is reviewed, for the editor and the record:
 * null where classmates do not review it. Its teachers and its students
 * read it.
 */
export const peerSettings = readProcedure
  .input(byAssignment)
  .handler(async ({ input, context }) => {
    const assignment = await assignmentById(
      context.tx,
      context.tenantId,
      input.assignmentId,
    );
    if (!assignment || assignment.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const teaches =
      (can(context, "assignments:author") ||
        can(context, "submissions:grade")) &&
      (await teachesClass(context, "teaching", assignment.classId));
    if (
      !teaches &&
      !(await isRecipient(
        context.tx,
        context.tenantId,
        assignment.id,
        context.actor.userId,
      ))
    )
      throw new ORPCError("NOT_FOUND");
    const peer = await settingsOf(context, assignment.id);
    return peer
      ? {
          reviews: peer.reviews,
          anonymous: peer.anonymous,
          dueAt: peer.dueAt,
          started: peer.startedAt !== null,
        }
      : null;
  });
