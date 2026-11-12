import type { ModuleScope } from "./extension";

import { contributionsTo, point } from "./extension";

/**
 * What a module does when someone who registered on the portal confirms
 * their address: what the school holds under that address becomes theirs,
 * and what they registered for opens.
 */
export interface AddressConfirmation {
  confirmed(
    scope: ModuleScope,
    input: {
      userId: string;
      email: string;
      today: string;
      /** What they registered for: themself, or someone in their care. */
      applyingFor: "self" | "other";
    },
  ): Promise<void>;
}

export const addressConfirmations = point<AddressConfirmation>(
  "address confirmations",
);

/** Runs every module's part of an address being confirmed. */
export async function confirmAddress(
  scope: ModuleScope,
  input: Parameters<AddressConfirmation["confirmed"]>[1],
) {
  for (const module of await contributionsTo(scope, addressConfirmations))
    await module.confirmed(scope, input);
}
