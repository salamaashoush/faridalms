import { useRouteContext } from "@tanstack/react-router";

import type { Sentence } from "~/utils/words";

import { everyFilling, slot } from "~/utils/extension";

import type { RenderContext } from "./render/parts";

/**
 * The choice fields of the website's sections a module gives the school
 * the words for, such as a grade asked on an enquiry form; a section asks
 * none other.
 */
export const siteChoiceFields = slot<string>("site choice fields");

/**
 * A sentence of the website in the words a module lends it, by the name the
 * server gives the page: the year an intake's tuition runs for, say. A
 * visitor's page knows nothing else of the school's modules.
 */
export interface SiteWords {
  word: string;
  neutral: Sentence;
  words: Sentence;
}

export const siteWords = slot<SiteWords>("site words");

/** A sentence of a page in the words its school lends it, or the neutral one. */
export function useSiteWords(
  context: RenderContext,
): <F extends Sentence>(neutral: F) => F {
  const { extensions } = useRouteContext({ from: "__root__" });
  const lent = everyFilling(extensions, siteWords).filter((each) =>
    context.words?.includes(each.word),
  );
  return <F extends Sentence>(neutral: F): F =>
    (lent.find((each) => each.neutral === neutral)?.words ?? neutral) as F;
}

/**
 * Who a voice on the website may be from, besides those every school has,
 * from a module that knows them: a parent, say. One no module on lends is
 * not offered.
 */
export const siteAudiences = slot<string>("site audiences");
