import type { ModuleId } from "@faridalms/domain/modules";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";

import type { Filling } from "./extension";

import { fill, slot } from "./extension";

/** A sentence of the catalogue, with whatever its placeholders take. */
export type Sentence = (...args: never[]) => string;

/**
 * A module's sentence in place of a neutral one: families put the
 * guardians back in a sentence core says without them, say. `alsoNeeds`
 * names modules the sentence speaks of beyond those of its filling, such
 * as a year and a grade in one sentence.
 */
export interface Words {
  neutral: Sentence;
  words: Sentence;
  alsoNeeds?: readonly ModuleId[];
}

export const moduleWords = slot<Words>("module words");

/** Fills `moduleWords` with a module's sentence, which takes what the neutral one takes. */
export const replaceWords = <F extends Sentence>(
  neutral: F,
  words: F,
  alsoNeeds?: readonly ModuleId[],
): Filling => fill(moduleWords, { neutral, words, alsoNeeds });

/** A sentence in the words of the modules on, or the neutral one where none has any. */
export function useWords(): <F extends Sentence>(neutral: F) => F {
  const filled = useSlot(moduleWords);
  const { modules } = useCurrentUser();
  return <F extends Sentence>(neutral: F): F =>
    (filled.find(
      (each) =>
        each.neutral === neutral &&
        (each.alsoNeeds ?? []).every((id) => modules[id]),
    )?.words ?? neutral) as F;
}

/** What `useWords` answers, for a helper a component hands it to. */
export type InWords = ReturnType<typeof useWords>;
