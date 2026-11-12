import { sharedAmong } from "@faridalms/database/stores/family-shares";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { can } from "../core/procedure";
import { reachesStudent } from "../core/reach";
import { attemptReaders } from "./points";

/** Someone who follows the student reads a piece of their work once a teacher shared it. */
export async function readSharedAttempt(
  context: UnitContext,
  attempt: { attemptId: string; studentId: string },
): Promise<boolean> {
  return (
    can(context, "children:read") &&
    (await reachesStudent(context, "teaching", attempt.studentId)) &&
    (
      await sharedAmong(context.tx, {
        tenantId: context.tenantId,
        attemptIds: [attempt.attemptId],
      })
    ).has(attempt.attemptId)
  );
}

/** Handed-in work a teacher shares with those who follow the student. */
export const COURSEWORK_WITH_FAMILIES: ModuleContributions = {
  module: "coursework",
  needs: ["families"],
  contributions: [contribute(attemptReaders, { reads: readSharedAttempt })],
};
