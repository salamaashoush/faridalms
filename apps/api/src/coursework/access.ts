import type { AssignmentRow } from "@faridalms/database/stores/coursework";

import { machineTranslationUnchecked } from "@faridalms/database/stores/assistant";
import {
  assignmentById,
  assignmentTranslationReviewedAt,
  isRecipient,
} from "@faridalms/database/stores/coursework";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { requireUnsettled } from "../classes/points";
import { requireCapability } from "../core/procedure";
import { teaches } from "../core/reach";

/** An assignment in a class the teacher reaches, or not found. */
export async function taughtAssignment(
  context: UnitContext,
  assignmentId: string,
) {
  const assignment = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  if (
    !assignment ||
    assignment.orgId !== context.schoolId ||
    !(await teaches(context, "teaching", assignment.classId))
  )
    throw new ORPCError("NOT_FOUND");
  return assignment;
}

export async function learnerAssignment(
  context: UnitContext,
  assignmentId: string,
) {
  requireCapability(context, "own-work:submit");
  const assignment = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  const recipient = assignment
    ? await isRecipient(
        context.tx,
        context.tenantId,
        assignment.id,
        context.actor.userId,
      )
    : null;
  if (!assignment || assignment.state !== "published" || !recipient)
    throw new ORPCError("NOT_FOUND");
  await requireUnsettled(context, assignment.classId);
  return ownSchedule(assignment, recipient);
}

/**
 * An assignment as one student meets it: their own due time if they have
 * one, and the same late window after it, so it closes for them that much
 * later too.
 */
export function ownSchedule(
  assignment: AssignmentRow,
  recipient: { dueAt: string | null },
) {
  const later =
    recipient.dueAt && assignment.dueAt
      ? Date.parse(recipient.dueAt) - Date.parse(assignment.dueAt)
      : 0;
  const closesAt =
    assignment.closesAt && later > 0
      ? new Date(Date.parse(assignment.closesAt) + later).toISOString()
      : assignment.closesAt;
  return {
    assignment: { ...assignment, closesAt },
    dueAt: recipient.dueAt ?? assignment.dueAt,
  };
}

/** Whether the model drafted the assignment's translation since a person last checked it. */
export async function translationUnchecked(context: UnitContext, id: string) {
  return machineTranslationUnchecked(context.tx, {
    tenantId: context.tenantId,
    host: "assignment",
    id,
    reviewedAt: await assignmentTranslationReviewedAt(
      context.tx,
      context.tenantId,
      id,
    ),
  });
}
