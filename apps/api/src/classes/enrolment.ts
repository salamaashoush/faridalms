import type { OpenSpan } from "@faridalms/domain/school";

import {
  lastMarkInClass,
  lastMarkInClasses,
} from "@faridalms/database/stores/attendance";
import {
  enrolledBefore,
  moveClassRuns,
} from "@faridalms/database/stores/classes";
import { joinOpenWork } from "@faridalms/database/stores/coursework";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo } from "../core/extension";
import { classJoins, runsRefusal } from "./points";

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

/**
 * Gives students who joined classes from the date the work still open to
 * the whole class, and tells the modules that keep something in step.
 */
export async function joinedClasses(
  context: UnitContext,
  joins: ReadonlyMap<string, readonly string[]>,
  from: string,
) {
  for (const [classId, studentIds] of joins)
    await joinOpenWork(context.tx, {
      tenantId: context.tenantId,
      studentIds,
      classId,
    });
  for (const contribution of await contributionsTo(context, classJoins))
    await contribution.joined(context, joins, from);
}

/**
 * Moves a class to new days and its enrolments with it, refusing what the
 * days taken already deny: a start past an enrolment's first day, an end
 * before a register already taken, and days a module keeps the class from.
 */
export async function moveClass(
  context: UnitContext,
  classId: string,
  before: OpenSpan,
  after: OpenSpan,
) {
  if (before.from === after.from && before.to === after.to) return;
  if (
    after.from > before.from &&
    (await enrolledBefore(context.tx, context.tenantId, classId, after.from))
  )
    throw new ORPCError("CONFLICT", { message: "class.runs_enrolments" });
  if (after.to !== null && (before.to === null || after.to < before.to)) {
    const last = await lastMarkInClass(context.tx, {
      tenantId: context.tenantId,
      classId,
      from: after.to,
    });
    if (last)
      throw new ORPCError("CONFLICT", {
        message: `class.registers_after:${last}`,
      });
  }
  const refusal = await runsRefusal(context, classId, after);
  if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
  await moveClassRuns(context.tx, {
    tenantId: context.tenantId,
    classId,
    before,
    after,
  });
}
