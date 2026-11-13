/**
 * Emphasis in a heading is stored as words between asterisks,
 * `Where every child is *known*`. These read and change that text as words
 * that are or are not emphasised, so a school selects words and emphasises
 * them instead of typing the asterisks.
 */

const MARK = /\*([^*\n]+)\*/g;

/** A heading's words without the asterisks, and which of them are emphasised. */
export interface EmphasisText {
  plain: string;
  emphasised: boolean[];
  /** Where each character of the plain words sits in the stored text, and one past the end. */
  raw: number[];
}

export function readEmphasis(text: string): EmphasisText {
  const plain: string[] = [];
  const emphasised: boolean[] = [];
  const raw: number[] = [];
  const add = (from: number, to: number, on: boolean) => {
    for (let at = from; at < to; at++) {
      plain.push(text.charAt(at));
      emphasised.push(on);
      raw.push(at);
    }
  };
  let at = 0;
  for (const match of text.matchAll(MARK)) {
    add(at, match.index, false);
    add(match.index + 1, match.index + match[0].length - 1, true);
    at = match.index + match[0].length;
  }
  add(at, text.length, false);
  raw.push(text.length);
  return { plain: plain.join(""), emphasised, raw };
}

/** The stored text for words and their emphasis; spaces at a run's edges stay outside it. */
export function writeEmphasis(plain: string, emphasised: boolean[]): string {
  let text = "";
  let at = 0;
  while (at < plain.length) {
    let end = at;
    while (end < plain.length && emphasised[end] === emphasised[at]) end += 1;
    const run = plain.slice(at, end);
    if (emphasised[at] && run.trim()) {
      const lead = run.length - run.trimStart().length;
      const trail = run.length - run.trimEnd().length;
      text += `${run.slice(0, lead)}*${run.trim()}*${run.slice(run.length - trail)}`;
    } else text += run;
    at = end;
  }
  return text;
}

/** Each emphasised run of words, in order, as the reader sees them. */
export function emphasisedRuns(text: string): string[] {
  return [...text.matchAll(MARK)].map((match) => (match[1] ?? "").trim());
}

const WORD = /[\p{L}\p{M}\p{N}'’-]/u;

function wordAt(plain: string, at: number): [number, number] | null {
  let start = at;
  let end = at;
  while (start > 0 && WORD.test(plain.charAt(start - 1))) start -= 1;
  while (end < plain.length && WORD.test(plain.charAt(end))) end += 1;
  return start === end ? null : [start, end];
}

function runAt(emphasised: boolean[], at: number): [number, number] | null {
  const inside = emphasised[at] ? at : emphasised[at - 1] ? at - 1 : -1;
  if (inside === -1) return null;
  let start = inside;
  let end = inside + 1;
  while (start > 0 && emphasised[start - 1]) start -= 1;
  while (end < emphasised.length && emphasised[end]) end += 1;
  return [start, end];
}

/** Where a point in the stored text falls among the plain words. */
function plainOffset(read: EmphasisText, rawAt: number): number {
  const index = read.raw.findIndex((at) => at >= rawAt);
  return index === -1 ? read.plain.length : index;
}

/** The plain words a selection toggles: those selected, else the run or word at the caret, without edge spaces. */
function toggled(
  read: EmphasisText,
  start: number,
  end: number,
): [number, number] | null {
  let from = plainOffset(read, Math.min(start, end));
  let to = plainOffset(read, Math.max(start, end));
  if (from === to) {
    const range = runAt(read.emphasised, from) ?? wordAt(read.plain, from);
    if (!range) return null;
    [from, to] = range;
  }
  while (from < to && /\s/u.test(read.plain.charAt(from))) from += 1;
  while (to > from && /\s/u.test(read.plain.charAt(to - 1))) to -= 1;
  return from === to ? null : [from, to];
}

const allEmphasised = (read: EmphasisText, from: number, to: number) =>
  read.emphasised
    .slice(from, to)
    .every((on, index) => on || /\s/u.test(read.plain.charAt(from + index)));

/** Whether the words a selection would toggle are all emphasised already. */
export function isEmphasised(text: string, start: number, end: number) {
  const read = readEmphasis(text);
  const range = toggled(read, start, end);
  return range !== null && allEmphasised(read, ...range);
}

/** The text after emphasising or un-emphasising a selection, and the selection over the same words. */
export interface EmphasisToggle {
  text: string;
  start: number;
  end: number;
}

/**
 * Emphasises the selected words, or takes the emphasis off them when all of
 * them already have it. A selection that only partly covers an emphasised
 * run joins it. With nothing selected, the run or word at the caret is
 * toggled. Offsets are in the stored text, as an input's selection is,
 * whichever way the script runs. Null when nothing would change, or when
 * a lone asterisk in the words would pair with a new one and mark the
 * wrong words.
 */
export function toggleEmphasis(
  text: string,
  start: number,
  end: number,
): EmphasisToggle | null {
  const read = readEmphasis(text);
  const range = toggled(read, start, end);
  if (!range) return null;
  const [from, to] = range;
  const emphasised = [...read.emphasised];
  emphasised.fill(!allEmphasised(read, from, to), from, to);
  const next = writeEmphasis(read.plain, emphasised);
  const check = readEmphasis(next);
  if (
    check.plain !== read.plain ||
    check.emphasised.some(
      (on, index) =>
        on !== emphasised[index] && !/\s/u.test(read.plain.charAt(index)),
    )
  )
    return null;
  const rawStart = check.raw[from] ?? next.length;
  const rawEnd = (check.raw[to - 1] ?? next.length - 1) + 1;
  return { text: next, start: rawStart, end: rawEnd };
}
