/**
 * How typed answers are compared with the answers a teacher accepts. Arabic
 * is written with optional marks and several letter forms for one sound, and
 * digits come in three scripts, so both sides are folded before comparing;
 * none of the quiz tools surveyed does this for Arabic.
 */

const HARAKAT = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const ALEF = /[آأإٱ]/g;
const ARABIC_INDIC = /[٠-٩]/g;
const EASTERN_ARABIC_INDIC = /[۰-۹]/g;
const EDGE_PUNCTUATION =
  /^[\s.,;:!?،؛؟"'«»()[\]-]+|[\s.,;:!?،؛؟"'«»()[\]-]+$/gu;

export interface FoldOptions {
  caseSensitive?: boolean;
  /** Treat final teh marbuta as heh, a common spelling in handwriting and typing. */
  tehMarbuta?: boolean;
}

/** Western digits for Arabic-Indic and Eastern Arabic-Indic ones. */
export function westernDigits(value: string): string {
  return value
    .replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    );
}

/** A typed answer reduced to what matters for comparing it. */
export function foldAnswer(value: string, options: FoldOptions = {}): string {
  let folded = westernDigits(value.normalize("NFC"))
    .replace(HARAKAT, "")
    .replace(TATWEEL, "")
    .replace(ALEF, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .replace(EDGE_PUNCTUATION, "");
  if (options.tehMarbuta) folded = folded.replace(/ة/g, "ه");
  return options.caseSensitive ? folded : folded.toLocaleLowerCase();
}

/** Edits between two strings, stopping once it passes `limit`. */
export function editDistance(a: string, b: string, limit = 3): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    let best = row;
    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

/**
 * How many slips a close-enough match forgives: none below three letters,
 * one up to nine, two above, as H5P's Fill in the Blanks does.
 */
export const slipsAllowed = (length: number) =>
  length < 3 ? 0 : length <= 9 ? 1 : 2;

/** The accepted answer a typed one matches, or null. */
export function matchAnswer(
  typed: string,
  accepted: readonly string[],
  options: FoldOptions & { closeEnough?: boolean } = {},
): string | null {
  const mine = foldAnswer(typed, options);
  if (mine === "") return null;
  for (const answer of accepted) {
    const theirs = foldAnswer(answer, options);
    if (theirs === mine) return answer;
    if (
      options.closeEnough &&
      editDistance(mine, theirs, slipsAllowed(theirs.length)) <=
        slipsAllowed(theirs.length)
    )
      return answer;
  }
  return null;
}

/**
 * A number typed in any digit script, with the Arabic decimal separator or a
 * point, thousands separators dropped. Null when it is not a number.
 */
export function parseNumber(value: string): number | null {
  const plain = westernDigits(value.trim())
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".")
    .replace(/^[−‒–]/, "-");
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(plain)) return null;
  return Number(plain);
}
