import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { studentsReached } from "../core/reach";

/** Whose day a Today card reads: the viewer's own, or a learner they follow. */
export const todaySchema = v.object({
  studentId: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
    "",
  ),
});

/**
 * The learner whose day the viewer reads: themself as a student, or one of
 * those they follow and still reach; null for a member of staff reading
 * their own teaching day.
 */
export async function learnerOfToday(
  context: UnitContext,
  studentId: string,
): Promise<string | null> {
  if (!studentId)
    return context.actor.workspace === "me" ? context.actor.userId : null;
  const reached = await studentsReached(context, "teaching", [studentId]);
  if (!context.actor.follows.includes(studentId) || !reached.has(studentId))
    throw new ORPCError("NOT_FOUND");
  return studentId;
}
