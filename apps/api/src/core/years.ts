import { schoolYears, workingYear } from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

/**
 * The year a request names, or the working year when it names none. A year
 * the school does not have is refused, never swapped for another.
 */
export async function yearOf(context: UnitContext, requested: string) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year = requested
    ? years.find((row) => row.id === requested)
    : workingYear(years, context.today);
  if (requested && !year) throw new ORPCError("NOT_FOUND");
  return { years, year: year ?? null };
}
