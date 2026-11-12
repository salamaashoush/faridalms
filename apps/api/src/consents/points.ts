import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/**
 * Purposes a module asks at a moment of its own, such as the consents an
 * application asks for when it is sent, so the families already at the
 * school are never asked them. With the module off they are asked like any
 * other.
 */
export interface ConsentMoment {
  meanings: readonly string[];
}

export const consentMoments = point<ConsentMoment>("consent moments");

/** The purposes a module on at the school asks at its own moment. */
export async function askedElsewhere(
  scope: ModuleScope,
): Promise<ReadonlySet<string>> {
  return new Set(
    (await contributionsTo(scope, consentMoments)).flatMap(
      (moment) => moment.meanings,
    ),
  );
}
