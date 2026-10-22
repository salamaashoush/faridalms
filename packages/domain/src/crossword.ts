import { foldAnswer } from "./answers";

/** Words in one crossword, as many as a page of clues holds. */
export const MAX_CROSSWORD_WORDS = 12;
/** Letters in one word, and squares across or down the whole grid, so a phone shows it whole. */
export const MAX_CROSSWORD_SIZE = 15;

const LETTER = /[\p{L}\p{N}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** A string's letters as a reader counts them, each with any marks it carries. */
export const graphemes = (text: string): string[] =>
  Array.from(segmenter.segment(text), (part) => part.segment);

/**
 * A word as its squares hold it: letters and digits alone, without marks,
 * spaces or hyphens, folded as typed answers are so that a square two words
 * share holds one letter, and in capitals as crosswords are printed.
 */
export function crosswordLetters(word: string): string[] {
  return graphemes(
    foldAnswer(word, { caseSensitive: true }).toLocaleUpperCase(),
  )
    .filter((character) => LETTER.test(character))
    .slice(0, MAX_CROSSWORD_SIZE + 1);
}

/** A word's place in the grid: where its first letter is, and which way it reads. */
export interface CrosswordEntry {
  id: string;
  /** The number printed in its first square, shared by a word across and one down that start there. */
  number: number;
  row: number;
  col: number;
  across: boolean;
  length: number;
}

export interface CrosswordLayout {
  width: number;
  height: number;
  entries: CrosswordEntry[];
}

/** A square's key in a student's answer: its row and column. */
export const squareKey = (row: number, col: number) => `${row}-${col}`;

/** The squares of a word, first letter first. */
export function squaresOf(
  entry: Pick<CrosswordEntry, "row" | "col" | "across" | "length">,
): string[] {
  return Array.from({ length: entry.length }, (_, index) =>
    entry.across
      ? squareKey(entry.row, entry.col + index)
      : squareKey(entry.row + index, entry.col),
  );
}

interface Placed {
  id: string;
  letters: string[];
  row: number;
  col: number;
  across: boolean;
}

interface Square {
  letter: string;
  /** Which way each word through it reads. */
  across: boolean[];
}

/** A crossword part-way laid out; squares are keyed by row and column, which may be negative until the end. */
interface Grid {
  squares: Map<string, Square>;
  placed: Placed[];
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const at = (row: number, col: number) => `${row},${col}`;

/** Ways a layout is tried before it is given up, enough for a page of words. */
const TRIES = 1500;
/** Words, and places for each, tried at each step, the likeliest first. */
const BRANCHES = 3;

function withWord(grid: Grid, word: Placed): Grid {
  const squares = new Map(
    [...grid.squares].map(([key, square]) => [
      key,
      { letter: square.letter, across: [...square.across] },
    ]),
  );
  const next = { ...grid, squares, placed: [...grid.placed, word] };
  word.letters.forEach((letter, index) => {
    const row = word.across ? word.row : word.row + index;
    const col = word.across ? word.col + index : word.col;
    const square = squares.get(at(row, col));
    if (square) square.across.push(word.across);
    else squares.set(at(row, col), { letter, across: [word.across] });
    next.top = Math.min(next.top, row);
    next.bottom = Math.max(next.bottom, row);
    next.left = Math.min(next.left, col);
    next.right = Math.max(next.right, col);
  });
  return next;
}

/** How many squares a word would share, or null where it cannot go. */
function crossings(grid: Grid, word: Omit<Placed, "id">): number | null {
  const empty = (row: number, col: number) => !grid.squares.has(at(row, col));
  const step = (index: number): [number, number] =>
    word.across ? [word.row, word.col + index] : [word.row + index, word.col];
  if (!empty(...step(-1)) || !empty(...step(word.letters.length))) return null;
  let shared = 0;
  for (const [index, letter] of word.letters.entries()) {
    const [row, col] = step(index);
    const square = grid.squares.get(at(row, col));
    if (square) {
      if (square.letter !== letter || square.across.includes(word.across))
        return null;
      shared += 1;
      continue;
    }
    const touching = word.across
      ? !empty(row - 1, col) || !empty(row + 1, col)
      : !empty(row, col - 1) || !empty(row, col + 1);
    if (touching) return null;
  }
  return shared;
}

/**
 * Where a word can go, the best first: crossing the most words, then
 * keeping the grid smallest and nearest a square, which reads better on a
 * page than a long one.
 */
function placements(
  grid: Grid,
  item: { id: string; letters: string[] },
): Placed[] {
  const found: { place: Placed; score: number }[] = [];
  const last = item.letters.length - 1;
  for (const [key, square] of grid.squares) {
    const [row = 0, col = 0] = key.split(",").map(Number);
    for (const [index, letter] of item.letters.entries()) {
      if (letter !== square.letter) continue;
      for (const across of [true, false]) {
        const place = {
          id: item.id,
          letters: item.letters,
          row: across ? row : row - index,
          col: across ? col - index : col,
          across,
        };
        const shared = crossings(grid, place);
        if (!shared) continue;
        const height =
          Math.max(grid.bottom, place.row + (across ? 0 : last)) -
          Math.min(grid.top, place.row) +
          1;
        const width =
          Math.max(grid.right, place.col + (across ? last : 0)) -
          Math.min(grid.left, place.col) +
          1;
        if (height > MAX_CROSSWORD_SIZE || width > MAX_CROSSWORD_SIZE) continue;
        found.push({
          place,
          score: shared * 10_000 - width * height - Math.abs(width - height),
        });
      }
    }
  }
  return found
    .toSorted((a, b) => b.score - a.score)
    .map((option) => option.place);
}

/**
 * Places the words still to go, those with fewest places first, trying
 * each one's best few places and stepping back when the rest cannot fit.
 * A word may only fit across one placed later, so a step back also tries
 * placing another word first.
 */
function search(
  grid: Grid,
  pending: readonly { id: string; letters: string[] }[],
  budget: { left: number },
): Grid | null {
  if (pending.length === 0) return grid;
  budget.left -= 1;
  if (budget.left < 0) return null;
  const options = pending
    .map((item, index) => ({ index, places: placements(grid, item) }))
    .filter((option) => option.places.length > 0)
    .toSorted((a, b) => a.places.length - b.places.length || a.index - b.index);
  for (const option of options.slice(0, BRANCHES)) {
    const rest = pending.filter((_, index) => index !== option.index);
    for (const place of option.places.slice(0, BRANCHES)) {
      const done = search(withWord(grid, place), rest, budget);
      if (done || budget.left < 0) return done;
    }
  }
  return null;
}

/**
 * Lays a crossword out from its words, the same way every time: the
 * longest first, then each word where it crosses the most already placed
 * and keeps the grid smallest, no word touching another except where they
 * cross. Null when the words cannot all cross, or the grid would grow too
 * big to read on a phone.
 */
export function crosswordLayout(
  words: readonly { id: string; answer: string }[],
): CrosswordLayout | null {
  const items = words
    .map((word, index) => ({
      id: word.id,
      letters: crosswordLetters(word.answer),
      index,
    }))
    .toSorted(
      (a, b) => b.letters.length - a.letters.length || a.index - b.index,
    );
  if (
    items.length === 0 ||
    items.some(
      (item) =>
        item.letters.length < 2 || item.letters.length > MAX_CROSSWORD_SIZE,
    )
  )
    return null;
  const start: Grid = {
    squares: new Map(),
    placed: [],
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  // Where one word first leads nowhere, another first may fit them all.
  const budget = { left: TRIES };
  let grid: Grid | null = null;
  for (const first of items) {
    grid = search(
      withWord(start, { ...first, row: 0, col: 0, across: true }),
      items.filter((item) => item !== first),
      budget,
    );
    if (grid || budget.left < 0) break;
  }
  if (!grid) return null;
  const starts = [
    ...new Set(
      grid.placed
        .map((word) => ({
          row: word.row - grid.top,
          col: word.col - grid.left,
        }))
        .toSorted((a, b) => a.row - b.row || a.col - b.col)
        .map((place) => squareKey(place.row, place.col)),
    ),
  ];
  return {
    width: grid.right - grid.left + 1,
    height: grid.bottom - grid.top + 1,
    entries: grid.placed
      .map((word) => {
        const row = word.row - grid.top;
        const col = word.col - grid.left;
        return {
          id: word.id,
          number: starts.indexOf(squareKey(row, col)) + 1,
          row,
          col,
          across: word.across,
          length: word.letters.length,
        };
      })
      .toSorted(
        (a, b) => a.number - b.number || Number(b.across) - Number(a.across),
      ),
  };
}

/**
 * The words a crossword cannot place, so its teacher knows which to change:
 * each word the rest fit without. All of them when no one word is to blame.
 */
export function crosswordMisfits(
  words: readonly { id: string; answer: string }[],
): string[] {
  if (crosswordLayout(words)) return [];
  const blamed = words.filter(
    (word) =>
      words.length > 2 &&
      crosswordLayout(words.filter((other) => other !== word)) !== null,
  );
  return (blamed.length > 0 ? blamed : words).map((word) => word.id);
}
