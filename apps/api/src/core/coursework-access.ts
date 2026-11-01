import type { AssignmentRow } from "@faridalms/database/stores/coursework";

import {
  assignmentById,
  isRecipient,
} from "@faridalms/database/stores/coursework";
import { holdYear } from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { requireCapability } from "./procedure";
import { teaches } from "./reach";

export async function requireOpenYear(context: UnitContext, yearId: string) {
  const lifecycle = await holdYear(context.tx, context.tenantId, yearId);
  if (!lifecycle) throw new ORPCError("NOT_FOUND");
  if (lifecycle === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
}

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
  await requireOpenYear(context, assignment.schoolYearId);
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
