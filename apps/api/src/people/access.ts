import type { CellTransaction } from "@faridalms/database/context";
import type { SessionContext } from "@faridalms/domain/workspace";

import { effectiveAccess } from "@faridalms/database/stores/identity";

import type { SchoolContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { youngStudentsOf } from "./points";

/**
 * A person's access at a school on a day in a context, with a student's
 * profile young where a module knows them to be a young child.
 */
export async function accessAt(
  scope: ModuleScope,
  input: { userId: string; today: string; context: SessionContext },
) {
  const young =
    input.context === "student" &&
    (await youngStudentsOf(scope, [input.userId], input.today)).has(
      input.userId,
    );
  return effectiveAccess(scope.tx, {
    tenantId: scope.tenantId,
    userId: input.userId,
    orgId: scope.schoolId,
    today: input.today,
    context: input.context,
    young,
  });
}

/** `accessAt` for a request at a school, before a unit of work knows its modules. */
export const accessAtSchool = (
  tx: CellTransaction,
  context: Pick<SchoolContext, "school" | "extensions">,
  input: { userId: string; today: string; context: SessionContext },
) =>
  accessAt(
    {
      tx,
      tenantId: context.school.tenantId,
      schoolId: context.school.schoolId,
      school: context.school,
      extensions: context.extensions,
    },
    input,
  );
