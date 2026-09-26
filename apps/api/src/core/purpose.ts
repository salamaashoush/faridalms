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
    subjectUserId: string;
    reason: string;
    write: boolean;
  },
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T> {
  requireCapability(
    context,
    CAPABILITY[use.purpose][use.write ? "write" : "read"],
  );
  await audit(context, {
    action: `${OBJECT[use.purpose]}.${use.write ? "write" : "read"}`,
    objectType: OBJECT[use.purpose],
    subjectUserId: use.subjectUserId,
    studentUserId: use.subjectUserId,
    details: { reason: use.reason },
  });
  return withPurpose(context.tx, use.purpose, work);
}
