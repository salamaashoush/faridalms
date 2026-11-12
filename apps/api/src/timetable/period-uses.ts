import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/**
 * What another module keeps in the school's periods, which a change to a
 * period may not rewrite: the first day on or after `from` (any day for
 * null) it used one of them on, or null.
 */
export interface PeriodUses {
  firstUse(
    context: UnitContext,
    periodIds: readonly string[],
    from: string | null,
  ): Promise<string | null>;
}

export const periodUses = point<PeriodUses>("period uses");

/** The first day on or after `from` any module used one of these periods on, or null. */
export async function firstPeriodUse(
  context: UnitContext,
  periodIds: readonly string[],
  from: string | null,
): Promise<string | null> {
  if (periodIds.length === 0) return null;
  const days = await Promise.all(
    (await contributionsTo(context, periodUses)).map((contribution) =>
      contribution.firstUse(context, periodIds, from),
    ),
  );
  return (
    days.flatMap((day) => (day === null ? [] : [day])).toSorted()[0] ?? null
  );
}
