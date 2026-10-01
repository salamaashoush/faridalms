import type { Scope } from "@faridalms/database/stores/students";

import { teachesClass } from "@faridalms/database/stores/classes";
import {
  assignmentById,
  isRecipient,
} from "@faridalms/database/stores/coursework";
import { holdYear } from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { can, requireCapability } from "./procedure";

export function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "classes:manage"),
  };
}

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
    !(await teachesClass(context.tx, scopeOf(context), assignment.classId))
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
  return { assignment, dueAt: recipient.dueAt ?? assignment.dueAt };
}
