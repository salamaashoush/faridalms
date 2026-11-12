import type { OpenSpan } from "@faridalms/domain/school";

import {
  enrolledBefore,
  moveClassRuns,
} from "@faridalms/database/stores/classes";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo } from "../core/extension";
import { classJoins, leavingRefusal, runsRefusal } from "./points";

/** Refuses ending a student's enrolments from a day where a module keeps something of them after it. */
export async function refuseOverRegisters(
  context: UnitContext,
  input: { studentId: string; classIds: readonly string[]; from: string },
) {
  const refusal = await leavingRefusal(context, input);
  if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
}

/**
 * Tells the modules that keep something in step with students joining
 * classes from the date, such as the work still open to the whole class.
 */
export async function joinedClasses(
  context: UnitContext,
  joins: ReadonlyMap<string, readonly string[]>,
  from: string,
) {
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
  const refusal = await runsRefusal(context, classId, after);
  if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
  await moveClassRuns(context.tx, {
    tenantId: context.tenantId,
    classId,
    before,
    after,
  });
}
