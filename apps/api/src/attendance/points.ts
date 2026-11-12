import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** Whose card a student scanned to check in, where a module hands out cards. */
export interface CheckInCards {
  holderOf(context: UnitContext, secret: string): Promise<string | null>;
}

export const checkInCards = point<CheckInCards>("check-in cards");

/** The student whose working card was scanned, or null for none. */
export async function cardHolder(
  context: UnitContext,
  secret: string,
): Promise<string | null> {
  for (const cards of await contributionsTo(context, checkInCards)) {
    const holder = await cards.holderOf(context, secret);
    if (holder) return holder;
  }
  return null;
}
