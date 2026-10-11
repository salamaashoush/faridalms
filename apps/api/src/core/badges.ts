import { schoolYears } from "@faridalms/database/stores/years";
import { BADGE_DAYS, badgeYearEnd } from "@faridalms/domain/badges";

import type { UnitContext } from "./context";

/**
 * How long a badge printed now lasts: until it has gone unused for the
 * sliding term, and never past the end of the school year.
 */
export async function badgeTerm(context: UnitContext) {
  const expiresAt = new Date(context.now.getTime() + BADGE_DAYS * 86_400_000);
  const until = badgeYearEnd(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
    expiresAt,
  );
  return { expiresAt, until };
}
