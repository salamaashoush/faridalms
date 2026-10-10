import type { BlockName, Heading, Side } from "./level";
import type { PackId } from "./levels";
import type { End } from "./run";

/**
 * Everything a puzzle says, given by the application in the reader's
 * language. A block's words name the place of its fields with `%1`, as the
 * block editor's own messages do.
 */
export interface PuzzleStrings {
  /** The board, for a reader who cannot see it: its size, then each square. */
  board: (columns: number, rows: number) => string;
  square: {
    open: string;
    wall: string;
    goal: string;
    gem: string;
    hero: (heading: string) => string;
  };
  hero: string;
  headings: Record<Heading, string>;
  /** A step towards a side of the grid, as a young child's arrow says it. */
  arrows: Record<Heading, string>;
  run: string;
  stop: string;
  again: string;
  undo: string;
  clear: string;
  /** The row of arrows, and what it says when it has none. */
  steps: string;
  noSteps: string;
  removeStep: (number: number, arrow: string) => string;
  /** The blocks of a program, and how many of them it may have. */
  program: string;
  blocksUsed: (used: number) => string;
  blocksOf: (used: number, limit: number) => string;
  /** How a run ended. */
  ends: Record<End, string>;
  tooManyBlocks: (limit: number) => string;
  /** Said once solved with more blocks than the teacher's program takes. */
  fewer: (used: number, ideal: number) => string;
  showPython: string;
  hidePython: string;
  python: string;
  loading: string;
  blocks: {
    start: string;
    forward: string;
    go: string;
    turn: string;
    repeat: string;
    until: string;
    if: string;
    else: string;
    /** The ways a "go" block steps, as its menu names them. */
    directions: Record<Heading, string>;
    turns: Record<"left" | "right", string>;
    sides: Record<Side, string>;
  };
}

/** What a teacher's puzzle designer says, on top of the puzzle's own words. */
export interface DesignerStrings {
  puzzle: PuzzleStrings;
  title: string;
  save: string;
  cancel: string;
  grid: string;
  columns: string;
  rows: string;
  more: (what: string) => string;
  fewer: (what: string) => string;
  tools: string;
  tool: Record<"wall" | "open" | "start" | "goal" | "gem", string>;
  /** A square of the grid, named for the tool that will change it. */
  paint: (column: number, row: number, holds: string) => string;
  turnHero: string;
  style: string;
  styles: Record<"arrows" | "blocks", string>;
  styleHints: Record<"arrows" | "blocks", string>;
  offered: string;
  blockNames: Record<BlockName, string>;
  limit: string;
  limitNone: string;
  limitHint: string;
  startFrom: string;
  packs: Record<PackId, string>;
  level: (pack: string, number: number) => string;
  answer: string;
  answerHint: string;
  answerSolves: string;
  answerMissing: string;
  answerFails: string;
}
