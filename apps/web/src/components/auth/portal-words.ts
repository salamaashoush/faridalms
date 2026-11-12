import { useRouteContext } from "@tanstack/react-router";

import type { PortalFace } from "~/queries/portal";
import type { Filling } from "~/utils/extension";
import type { Sentence } from "~/utils/words";

import { everyFilling, fill, slot } from "~/utils/extension";

/**
 * A sentence a school's portal says before anyone signs in, in the words
 * of those a module brings to it: families signing in beside students
 * and staff, say. Chosen by the audiences the school's face names, since a
 * stranger's page knows nothing else of the school's modules.
 */
export interface PortalWords {
  audience: string;
  neutral: Sentence;
  words: Sentence;
}

export const portalWords = slot<PortalWords>("portal words");

/** Fills `portalWords` with an audience's sentence, which takes what the neutral one takes. */
export const portalSentence = <F extends Sentence>(
  audience: string,
  neutral: F,
  words: F,
): Filling => fill(portalWords, { audience, neutral, words });

/** A sentence of the portal in the words of the school's audiences, or the neutral one. */
export function usePortalWords(
  face: PortalFace | null,
): <F extends Sentence>(neutral: F) => F {
  const { extensions } = useRouteContext({ from: "__root__" });
  const filled = everyFilling(extensions, portalWords).filter((each) =>
    face?.audiences.includes(each.audience),
  );
  return <F extends Sentence>(neutral: F): F =>
    (filled.find((each) => each.neutral === neutral)?.words ?? neutral) as F;
}
