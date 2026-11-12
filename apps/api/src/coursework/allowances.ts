import {
  arrangeDue,
  recipientStudents,
} from "@faridalms/database/stores/coursework";

import type { ModuleScope } from "../core/extension";
import type { AllowanceFollower } from "../people/allowances";

import { allowancesOf } from "../people/allowances";

/**
 * Moves the due times of work set for some students, or of one
 * assignment's recipients, by the days their allowances add.
 */
export async function dueByAllowances(
  scope: ModuleScope,
  input: { assignmentId?: string; studentIds?: readonly string[]; from?: Date },
): Promise<void> {
  const studentIds =
    input.studentIds ??
    (input.assignmentId
      ? await recipientStudents(scope.tx, {
          tenantId: scope.tenantId,
          assignmentId: input.assignmentId,
        })
      : []);
  const allowances = await allowancesOf(scope, studentIds);
  await arrangeDue(scope.tx, {
    tenantId: scope.tenantId,
    ...input,
    days: new Map(
      [...allowances].map(([id, allowed]) => [id, allowed.extensionDays]),
    ),
  });
}

/** Work still to come due follows a student's changed allowances. */
export const DUE_FOLLOWS: AllowanceFollower = {
  changed: (context, input) => dueByAllowances(context, input),
};
