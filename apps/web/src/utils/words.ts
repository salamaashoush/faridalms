import { useRouteContext } from "@tanstack/react-router";

import { useCurrentUser } from "~/hooks/useCurrentUser";

import type { Filling, ModuleFillings, SchoolFace } from "./extension";

import { fill, placed, slot } from "./extension";

/** A sentence of the catalogue, with whatever its placeholders take. */
export type Sentence = (...args: never[]) => string;

/**
 * A module's sentence in place of a neutral one: families put the
 * guardians back in a sentence core says without them, say. A sentence
 * that speaks of a second module is filled from a link file that needs it.
 */
export interface Words {
  neutral: Sentence;
  words: Sentence;
}

export const moduleWords = slot<Words>("module words");

/** Fills `moduleWords` with a module's sentence, which takes what the neutral one takes. */
export const replaceWords = <F extends Sentence>(
  neutral: F,
  words: F,
): Filling => fill(moduleWords, { neutral, words });

/**
 * Sentences in the words of the modules on: of those offered for a neutral
 * sentence, the one needing the most modules, since it speaks of each of
 * them. Two offers needing as many are refused by `words.spec.ts`.
 */
export function wordsOf(
  extensions: readonly ModuleFillings[],
  face: SchoolFace,
): <F extends Sentence>(neutral: F) => F {
  const offers = placed(extensions, face, moduleWords);
  return <F extends Sentence>(neutral: F): F => {
    let chosen: (typeof offers)[number] | undefined;
    for (const offer of offers)
      if (
        offer.value.neutral === neutral &&
        (!chosen || offer.modules.length > chosen.modules.length)
      )
        chosen = offer;
    return (chosen?.value.words ?? neutral) as F;
  };
}

/** A sentence in the words of the modules on, or the neutral one where none has any. */
export function useWords(): <F extends Sentence>(neutral: F) => F {
  const { extensions } = useRouteContext({ from: "__root__" });
  return wordsOf(extensions, useCurrentUser());
}

/** What `useWords` answers, for a helper a component hands it to. */
export type InWords = ReturnType<typeof useWords>;
