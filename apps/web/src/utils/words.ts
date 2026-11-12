import { useSlot } from "~/hooks/useSlot";

import { slot } from "./extension";

/**
 * A module's sentence in place of core's neutral one, by the place it
 * stands in: families put the guardians back in a sentence core says
 * without them, say.
 */
export interface Words {
  key: string;
  words: () => string;
}

export const moduleWords = slot<Words>("module words");

/** A sentence in the words of the modules on, or core's own where none has any. */
export function useWords(): (key: string, neutral: () => string) => string {
  const filled = useSlot(moduleWords);
  return (key, neutral) =>
    (filled.find((each) => each.key === key)?.words ?? neutral)();
}
