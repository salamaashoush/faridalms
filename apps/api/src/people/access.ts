import type { CellTransaction } from "@faridalms/database/context";
import type { SessionContext } from "@faridalms/domain/workspace";

import { effectiveAccess } from "@faridalms/database/stores/identity";

import type { SchoolContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";
import { youngStudentsOf } from "./points";

/**
 * A context a module opens to a person beyond those their roles open by
 * themselves: a family's, to someone following a learner, say.
 */
export interface ContextOpener {
  context: SessionContext;
  opens(
    scope: ModuleScope,
    input: { userId: string; roles: readonly string[]; today: string },
  ): Promise<boolean>;
}

export const contextOpeners = point<ContextOpener>("context openers");

/** The contexts the modules on open to a person holding these roles. */
async function openedFor(
  scope: ModuleScope,
  input: { userId: string; roles: readonly string[]; today: string },
): Promise<SessionContext[]> {
  const opened: SessionContext[] = [];
  for (const opener of await contributionsTo(scope, contextOpeners))
    if (!opened.includes(opener.context) && (await opener.opens(scope, input)))
      opened.push(opener.context);
  return opened;
}

/**
 * A person's access at a school on a day in a context, with a student's
 * profile young where a module knows them to be a young child, and the
 * contexts the modules open beside those the roles do.
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
    opens: (roles) =>
      openedFor(scope, { userId: input.userId, roles, today: input.today }),
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
