/**
 * Finding words in a document's text. Arabic is written with optional vowel
 * marks and several forms of alef, so both what is sought and the text are
 * folded before comparing, as typed answers are; a search for محمد finds
 * مُحَمَّد. The fold keeps a map back to the text's own offsets, so a match
 * is shown and replaced where it really is.
 */

const MARKS = /[ً-ٰٟۖ-ۭـ]/u;
const ALEF = /[آأإٱ]/u;

interface Folded {
  text: string;
  /** For each folded character, where it starts in the original text. */
  starts: number[];
  /** For each folded character, where it ends in the original text. */
  ends: number[];
}

function fold(text: string, matchCase: boolean): Folded {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const character of text) {
    const from = at;
    at += character.length;
    if (MARKS.test(character)) continue;
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
    }
  }
  return { text: folded, starts, ends };
}

/** Where a search is found in a text, as offsets into the text itself, none overlapping. */
export function findIn(
  text: string,
  query: string,
  matchCase = false,
): { start: number; end: number }[] {
  const sought = fold(query, matchCase).text;
  if (!sought) return [];
  const folded = fold(text, matchCase);
  const found: { start: number; end: number }[] = [];
  let from = folded.text.indexOf(sought);
  while (from >= 0) {
    const last = from + sought.length - 1;
    found.push({
      start: folded.starts[from] ?? 0,
      end: folded.ends[last] ?? 0,
    });
    from = folded.text.indexOf(sought, from + sought.length);
  }
  return found;
}
