import { foldAnswer } from "@faridalms/domain/answers";

import index from "./pictures.json" with { type: "json" };

export type PictureSource = "arasaac" | "openmoji";

export interface LibraryPicture {
  source: PictureSource;
  id: string;
  /** What it shows, in the reader's language when the source has it. */
  label: string;
  /** A small copy to choose from, and the copy a lesson keeps. */
  thumb: string;
  full: string;
}

interface Entry {
  source: PictureSource;
  id: string;
  en: string[];
  ar: string[];
  /** Every keyword folded for matching: no case, vowel marks or alef forms. */
  folded: string[];
}

// Arabic words are matched without "al-" before them or a final teh marbuta
// after, so "القطة" finds the pictogram ARASAAC files under "قِطّ".
const stem = (word: string) =>
  word.replace(/^ال(?=\p{L}{2})/u, "").replace(/ه$/u, "");
const fold = (text: string) =>
  foldAnswer(text, { tehMarbuta: true })
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(" ")
    .map(stem)
    .join(" ");
const split = (words: string) => (words ? words.split("|") : []);

let entries: Entry[] | null = null;

/** The index read once, on the first search. */
function loaded(): Entry[] {
  entries ??= [
    ...index.arasaac.map(([id, en, ar]) => {
      const english = split(String(en));
      const arabic = split(String(ar));
      return {
        source: "arasaac" as const,
        id: String(id),
        en: english,
        ar: arabic,
        folded: [...english, ...arabic].map(fold),
      };
    }),
    ...index.openmoji.map(([id, en]) => {
      const english = split(String(en));
      return {
        source: "openmoji" as const,
        id: String(id),
        en: english,
        ar: [],
        folded: english.map(fold),
      };
    }),
  ];
  return entries;
}

/** How well an entry's keywords meet the query: whole, from the start, a word's start. */
function score(entry: Entry, query: string, terms: readonly string[]): number {
  let best = 0;
  for (const keyword of entry.folded) {
    if (keyword === query) return 100;
    if (keyword.startsWith(query)) best = Math.max(best, 60);
    const words = keyword.split(" ");
    if (terms.every((term) => words.some((word) => word.startsWith(term))))
      best = Math.max(best, 30);
  }
  return best;
}

function urls(source: PictureSource, id: string) {
  if (source === "arasaac")
    return {
      thumb: `https://static.arasaac.org/pictograms/${id}/${id}_300.png`,
      full: `https://static.arasaac.org/pictograms/${id}/${id}_500.png`,
    };
  const svg = `https://cdn.jsdelivr.net/npm/openmoji@${index.openmojiVersion}/color/svg/${id}.svg`;
  return { thumb: svg, full: svg };
}

/**
 * Pictures whose words meet the query, best first. ARASAAC's pictograms come
 * before OpenMoji's emoji at the same score: drawn for children learning to
 * talk, they read more plainly at a young child's size.
 */
export function searchPictures(
  query: string,
  locale: "ar" | "en",
  limit = 48,
): LibraryPicture[] {
  const folded = fold(query).trim().replace(/\s+/g, " ");
  if (!folded) return [];
  const terms = folded.split(" ");
  return loaded()
    .map((entry, order) => ({
      entry,
      order,
      score: score(entry, folded, terms),
    }))
    .filter((hit) => hit.score > 0)
    .toSorted((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ entry }) => ({
      source: entry.source,
      id: entry.id,
      label:
        (locale === "ar" ? (entry.ar[0] ?? entry.en[0]) : entry.en[0]) ?? "",
      ...urls(entry.source, entry.id),
    }));
}
