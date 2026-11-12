import type { ModuleScope } from "./extension";

import { contributionsTo, point } from "./extension";

/**
 * A count a module reports to the operator console with a school's usage,
 * under its key: what the console must know before the module leaves the
 * school's plan, say.
 */
export interface UsageFact {
  key: string;
  measure(scope: ModuleScope, today: string): Promise<number>;
}

export const usageFacts = point<UsageFact>("usage facts");

/** Every module's counts for the school, by key. */
export async function usageFactsOf(
  scope: ModuleScope,
  today: string,
): Promise<Record<string, number>> {
  const facts: Record<string, number> = {};
  for (const fact of await contributionsTo(scope, usageFacts))
    facts[fact.key] = await fact.measure(scope, today);
  return facts;
}
