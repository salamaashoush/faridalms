import { crosswordLetters } from "./crossword";
import { seededRandom } from "./seeded";

/** Words hidden in one grid, as many as a list beside it holds. */
export const MAX_SEARCH_WORDS = 12;
/** Squares across and down, so a phone shows the grid whole and big enough to press. */
export const MAX_SEARCH_SIZE = 12;
const SMALLEST = 6;

/** A word's line in the grid: its first square, and the step to each next one. */
export interface SearchLine {
  row: number;
  col: number;
  /** Down a row each letter, up one, or neither. */
  down: -1 | 0 | 1;
  /** Along a column each letter, back one, or neither. */
  along: -1 | 0 | 1;
  length: number;
}

export interface WordSearch {
  /** The grid's letters, row by row. */
  rows: string[][];
  /** Where each word is hidden, by its id. */
  lines: Record<string, SearchLine>;
}

/** Across, down and down the diagonal, the ways a young reader finds a word. */
const WAYS: readonly [-1 | 0 | 1, -1 | 0 | 1][] = [
  [0, 1],
  [1, 0],
  [1, 1],
];

/** Every way a line runs, backwards, up and the other diagonal too, for older readers. */
const ALL_WAYS: readonly [-1 | 0 | 1, -1 | 0 | 1][] = [
  ...WAYS,
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

/**
 * Hides words in a grid of letters, the same way every time for the same
 * seed: the longest first, each where a seeded draw puts it among the
 * places it fits, sharing a letter with another word where they agree. The
 * squares left over take letters drawn from the words themselves, so no
 * stray letter stands out. Words run every way when asked to, else only
 * the three a young reader follows. Null when the words cannot all fit.
 */
export function wordSearch(
  words: readonly { id: string; answer: string }[],
  seed: string,
  backwards = false,
): WordSearch | null {
  const ways = backwards ? ALL_WAYS : WAYS;
  const items = words
    .map((word, index) => ({
      id: word.id,
      letters: crosswordLetters(word.answer),
      index,
    }))
    .toSorted(
      (a, b) => b.letters.length - a.letters.length || a.index - b.index,
    );
  const longest = items[0]?.letters.length ?? 0;
  if (
    items.length === 0 ||
    longest > MAX_SEARCH_SIZE ||
    items.some((item) => item.letters.length < 2)
  )
    return null;
  const letterCount = items.reduce((sum, item) => sum + item.letters.length, 0);
  const start = Math.max(
    SMALLEST,
    longest,
    Math.ceil(Math.sqrt(letterCount * 2)),
  );
  for (let size = start; size <= MAX_SEARCH_SIZE; size++) {
    const random = seededRandom(`${seed}:${size}`);
    const grid: (string | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null),
    );
    const lines: Record<string, SearchLine> = {};
    let fits = true;
    for (const item of items) {
      const places: SearchLine[] = [];
      const reach = item.letters.length - 1;
      const inside = (at: number, step: number) =>
        at + step * reach >= 0 && at + step * reach < size;
      for (const [down, along] of ways)
        for (let row = 0; row < size; row++)
          for (let col = 0; col < size; col++) {
            if (!inside(row, down) || !inside(col, along)) continue;
            const line = { row, col, down, along, length: item.letters.length };
            const agrees = item.letters.every((letter, index) => {
              const there = grid[row + down * index]?.[col + along * index];
              return there === null || there === letter;
            });
            if (agrees) places.push(line);
          }
      const line = places[Math.floor(random() * places.length)];
      if (!line) {
        fits = false;
        break;
      }
      item.letters.forEach((letter, index) => {
        const row = grid[line.row + line.down * index];
        if (row) row[line.col + line.along * index] = letter;
      });
      lines[item.id] = line;
    }
    if (!fits) continue;
    // Each of the words' letters as likely as another, so no one letter
    // crowds the grid.
    const pool = [...new Set(items.flatMap((item) => item.letters))];
    return {
      rows: grid.map((row) =>
        row.map(
          (letter) => letter ?? pool[Math.floor(random() * pool.length)] ?? "",
        ),
      ),
      lines,
    };
  }
  return null;
}

/** The grid a word search question shows, the same for every student of it. */
export const searchOf = (question: {
  id: string;
  words: readonly { id: string; answer: string }[];
  backwards?: boolean | undefined;
}) => wordSearch(question.words, question.id, question.backwards ?? false);

/** The squares of a line, as row and column, first letter first. */
export function squaresAlong(line: SearchLine): [number, number][] {
  return Array.from({ length: line.length }, (_, index) => [
    line.row + line.down * index,
    line.col + line.along * index,
  ]);
}

/**
 * The letters between two squares in a straight line across, down or on a
 * diagonal, either way; null when the squares are not in line.
 */
export function lettersBetween(
  rows: readonly (readonly string[])[],
  stretch: readonly number[],
): string[] | null {
  const [fromRow = 0, fromCol = 0, toRow = 0, toCol = 0] = stretch;
  const down = Math.sign(toRow - fromRow);
  const along = Math.sign(toCol - fromCol);
  const steps = Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol));
  if (
    (down !== 0 && along !== 0 && Math.abs(toRow - fromRow) !== steps) ||
    (down !== 0 && along !== 0 && Math.abs(toCol - fromCol) !== steps)
  )
    return null;
  return Array.from(
    { length: steps + 1 },
    (_, index) => rows[fromRow + down * index]?.[fromCol + along * index] ?? "",
  );
}

/**
 * Whether a stretch a student chose spells a word, read either way. A word
 * the leftover letters happen to spell again counts wherever it is found.
 */
export function spells(
  rows: readonly (readonly string[])[],
  stretch: readonly number[],
  word: string,
): boolean {
  const letters = lettersBetween(rows, stretch);
  const wanted = crosswordLetters(word);
  if (!letters || letters.length !== wanted.length) return false;
  return (
    letters.every((letter, index) => letter === wanted[index]) ||
    letters.every((letter, index) => letter === wanted.at(-1 - index))
  );
}

/** The squares from one end of a stretch to the other, when they lie in a line. */
export function squaresBetween(stretch: readonly number[]): [number, number][] {
  const [fromRow = 0, fromCol = 0, toRow = 0, toCol = 0] = stretch;
  const down = Math.sign(toRow - fromRow);
  const along = Math.sign(toCol - fromCol);
  const steps = Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol));
  return Array.from({ length: steps + 1 }, (_, index) => [
    fromRow + down * index,
    fromCol + along * index,
  ]);
}
