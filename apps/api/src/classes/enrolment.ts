import { lastMarkInClasses } from "@faridalms/database/stores/attendance";
import { joinOpenWork } from "@faridalms/database/stores/coursework";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

/**
 * Ending enrolments on a day before a register that already marks the
 * student would leave that register counting someone no longer in the class.
 */
export async function refuseOverRegisters(
  context: UnitContext,
  input: { studentId: string; classIds: readonly string[]; from: string },
) {
  const last = await lastMarkInClasses(context.tx, {
    tenantId: context.tenantId,
    ...input,
  });
  if (last)
    throw new ORPCError("CONFLICT", {
      message: `enrollment.registers_after:${last}`,
    });
}

/** Gives students who joined classes the work still open to the whole class. */
export async function joinedClasses(
  context: UnitContext,
  joins: ReadonlyMap<string, readonly string[]>,
) {
  for (const [classId, studentIds] of joins)
    await joinOpenWork(context.tx, {
      tenantId: context.tenantId,
      studentIds,
      classId,
    });
}
