import type { CellTransaction, Purpose } from "@faridalms/database/context";
import type { Capability } from "@faridalms/domain/capabilities";

import { withPurpose } from "@faridalms/database/context";

import type { UnitContext } from "./context";

import { audit, requireCapability } from "./procedure";

const CAPABILITY: Record<Purpose, { read: Capability; write: Capability }> = {
  health: { read: "health:read", write: "health:write" },
  demographics: { read: "demographics:read", write: "demographics:write" },
  custody: { read: "custody:read", write: "custody:write" },
};

const OBJECT: Record<Purpose, string> = {
  health: "health_record",
  demographics: "demographics",
  custody: "relationship_restriction",
};

/**
 * Special-category rows are invisible until their purpose is set. This checks
 * the capability, records the access with its subject and reason, then runs
 * the work with the purpose set; the purpose is cleared whether it succeeds
 * or throws.
 */
export async function withPurposeFor<T>(
  context: UnitContext,
  use: {
    purpose: Purpose;
    /** Whose records are read, each on their own history: one person, or everyone a list shows. */
    subjectUserId: string | readonly string[];
    reason: string;
    write: boolean;
    /**
     * What lets this use run instead of the purpose's own capability: the
     * admissions office reading an applicant's needs, or a family writing
     * them for the child they applied for, whose reach the caller checked.
     */
    capabilities?: readonly Capability[];
  },
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T> {
  requireCapability(
    context,
    ...(use.capabilities ?? [
      CAPABILITY[use.purpose][use.write ? "write" : "read"],
    ]),
  );
  const subjects =
    typeof use.subjectUserId === "string"
      ? [use.subjectUserId]
      : [...new Set(use.subjectUserId)];
  for (const subjectUserId of subjects)
    await audit(context, {
      action: `${OBJECT[use.purpose]}.${use.write ? "write" : "read"}`,
      objectType: OBJECT[use.purpose],
      subjectUserId,
      studentUserId: subjectUserId,
      details: { reason: use.reason },
    });
  return withPurpose(context.tx, use.purpose, work);
}
