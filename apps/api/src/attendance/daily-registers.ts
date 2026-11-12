import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** Classes whose register in the official period is the school day's attendance. */
export interface DailyRegisters {
  classIds(context: UnitContext, yearId: string): Promise<string[]>;
}

export const dailyRegisters = point<DailyRegisters>("daily registers");

/** The classes of a year owed a register in the official period every school day. */
export async function dailyClassIds(
  context: UnitContext,
  yearId: string,
): Promise<string[]> {
  const found = await Promise.all(
    (await contributionsTo(context, dailyRegisters)).map((contribution) =>
      contribution.classIds(context, yearId),
    ),
  );
  return [...new Set(found.flat())];
}
