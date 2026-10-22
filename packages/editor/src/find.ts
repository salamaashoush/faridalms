/**
 * Finding words in a document's text. Arabic is written with optional vowel
 * marks and several forms of alef, so both what is sought and the text are
 * folded before comparing, as typed answers are; a search for محمد finds
 * مُحَمَّد. The fold keeps a map back to the text's own offsets, so a match
 * is shown and replaced where it really is.
 */

const MARKS = /[ً-ٰٟۖ-ۭـ]/u;
const ALEF = /[آأإٱ]/u;
const WORD = /[\p{L}\p{N}\p{M}\p{Pc}]/u;

export interface FindOptions {
  matchCase?: boolean;
  /** A match counts only where no letter or digit runs on either side of it. */
  wholeWords?: boolean;
}

interface Folded {
  text: string;
  /** For each folded character, where it starts in the original text. */
  starts: number[];
  /** For each folded character, where it ends in the original text. */
  ends: number[];
  /** For each folded character, whether it is part of a word. */
  words: boolean[];
}

function fold(text: string, matchCase: boolean): Folded {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  const words: boolean[] = [];
  let at = 0;
  for (const character of text) {
    const from = at;
    at += character.length;
    if (MARKS.test(character)) continue;
    const word = WORD.test(character);
    let kept = ALEF.test(character) ? "ا" : character === "ى" ? "ي" : character;
    if (!matchCase) {
      const lower = kept.toLocaleLowerCase();
      // A letter whose small form is longer would shift every offset after it.
      if (lower.length === kept.length) kept = lower;
    }
    for (let index = 0; index < kept.length; index++) {
      folded += kept[index];
      starts.push(from);
      ends.push(at);
      words.push(word);
    }
  }
  return { text: folded, starts, ends, words };
}

/** Where a search is found in a text, as offsets into the text itself, none overlapping. */
export function findIn(
  text: string,
  query: string,
  { matchCase = false, wholeWords = false }: FindOptions = {},
): { start: number; end: number }[] {
  const search = fold(query, matchCase);
  const sought = search.text;
  if (!sought) return [];
  const folded = fold(text, matchCase);
  // Only an edge of the search that is itself a word needs a word's edge in
  // the text, so a search ending in a space or a full stop still finds.
  const openStart = wholeWords && search.words[0];
  const openEnd = wholeWords && search.words.at(-1);
  const found: { start: number; end: number }[] = [];
  let from = folded.text.indexOf(sought);
  while (from >= 0) {
    const after = from + sought.length;
    const whole =
      !(openStart && folded.words[from - 1]) &&
      !(openEnd && folded.words[after]);
    if (whole) {
      found.push({
        start: folded.starts[from] ?? 0,
        end: folded.ends[after - 1] ?? 0,
      });
    }
    from = folded.text.indexOf(sought, whole ? after : from + 1);
  }
  return found;
}
