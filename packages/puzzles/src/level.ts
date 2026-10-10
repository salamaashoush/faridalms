import * as v from "valibot";

import type { Program } from "./program";

import { programSchema } from "./program";

/** The four ways across a grid, clockwise, so a turn is one step along. */
export const HEADINGS = ["north", "east", "south", "west"] as const;
export type Heading = (typeof HEADINGS)[number];

/** Beside the way the hero faces, for a block that looks before it moves. */
export const SIDES = ["ahead", "left", "right"] as const;
export type Side = (typeof SIDES)[number];

/**
 * How a puzzle is answered: a row of arrows a young child taps in, or a
 * program of blocks.
 */
export const PUZZLE_STYLES = ["arrows", "blocks"] as const;
export type PuzzleStyle = (typeof PUZZLE_STYLES)[number];

/**
 * The blocks a puzzle may offer. `go` steps towards a side of the grid;
 * `forward` and `turn` steer the hero from where it faces.
 */
export const BLOCK_NAMES = [
  "go",
  "forward",
  "turn",
  "repeat",
  "until",
  "if",
  "ifelse",
] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

/** A single row is a puzzle too: a corridor to walk along. */
export const MIN_SIDE = 1;
export const MAX_SIDE = 8;
export const MAX_GEMS = 12;

const length = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(MIN_SIDE),
  v.maxValue(MAX_SIDE),
);
const cell = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(MAX_SIDE * MAX_SIDE - 1),
);

interface Shape {
  cols: number;
  rows: number;
  walls: number[];
  gems: number[];
  start: { cell: number; heading: Heading };
  goal: number;
}

/** Every square is on the grid, and none holds two things. */
function laidOut(level: Shape): boolean {
  const taken = [level.start.cell, level.goal, ...level.walls, ...level.gems];
  return (
    taken.every((at) => at < level.cols * level.rows) &&
    new Set(taken).size === taken.length
  );
}

/**
 * A puzzle: a grid with walls, where the hero starts and which way it
 * faces, the square to reach, and gems to pick up on the way. `blocks` are
 * what a program may be built from, `limit` how many of them at most, and
 * `solution` the teacher's own program, which shows the puzzle can be done
 * and how few blocks it takes.
 */
export const levelSchema = v.pipe(
  v.object({
    cols: length,
    rows: length,
    walls: v.pipe(v.array(cell), v.maxLength(MAX_SIDE * MAX_SIDE)),
    gems: v.pipe(v.array(cell), v.maxLength(MAX_GEMS)),
    start: v.object({ cell, heading: v.picklist(HEADINGS) }),
    goal: cell,
    style: v.picklist(PUZZLE_STYLES),
    blocks: v.pipe(
      v.array(v.picklist(BLOCK_NAMES)),
      v.maxLength(BLOCK_NAMES.length),
      v.check(
        (blocks) => new Set(blocks).size === blocks.length,
        "puzzles.blocks_repeated",
      ),
    ),
    limit: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
    ),
    solution: programSchema,
  }),
  v.check((level) => laidOut(level), "puzzles.level_layout"),
);
export type Level = v.InferOutput<typeof levelSchema>;

/** A puzzle as a student is given it: the teacher's program stays behind. */
export type StudentLevel = Omit<Level, "solution"> & {
  /** How few blocks the teacher's program takes, where there is one. */
  ideal: number | null;
};

/** The blocks a puzzle's program may use: a row of arrows only steps. */
export function blocksOf(level: Pick<Level, "style" | "blocks">): BlockName[] {
  return level.style === "arrows" ? ["go"] : level.blocks;
}

export const columnOf = (level: Pick<Level, "cols">, at: number) =>
  at % level.cols;
export const rowOf = (level: Pick<Level, "cols">, at: number) =>
  Math.floor(at / level.cols);

const STEP: Record<Heading, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/** The square next to one on a side of the grid, or null past its edge or at a wall. */
export function neighbour(
  level: Pick<Level, "cols" | "rows" | "walls">,
  at: number,
  heading: Heading,
): number | null {
  const [across, down] = STEP[heading];
  const column = columnOf(level, at) + across;
  const row = rowOf(level, at) + down;
  if (column < 0 || column >= level.cols || row < 0 || row >= level.rows)
    return null;
  const next = row * level.cols + column;
  return level.walls.includes(next) ? null : next;
}

/** The way the hero faces after a turn, or what lies to a side of it. */
export function facing(heading: Heading, side: Side): Heading {
  const turn = side === "left" ? 3 : side === "right" ? 1 : 0;
  return HEADINGS[(HEADINGS.indexOf(heading) + turn) % 4] ?? heading;
}

/**
 * A level drawn as rows of characters, which is how the built-in ones are
 * written: `#` a wall, `S` the start, `G` the goal, `*` a gem, anything
 * else open floor.
 */
export function levelOf(
  map: readonly string[],
  rest: Pick<Level, "style" | "blocks" | "limit"> & {
    heading: Heading;
    solution: Program;
  },
): Level {
  const cols = Math.max(...map.map((row) => row.length));
  const squares = map.flatMap((row) => row.padEnd(cols, ".").split(""));
  const all = (mark: string) =>
    squares.flatMap((square, at) => (square === mark ? [at] : []));
  return {
    cols,
    rows: map.length,
    walls: all("#"),
    gems: all("*"),
    start: { cell: Math.max(0, squares.indexOf("S")), heading: rest.heading },
    goal: Math.max(0, squares.indexOf("G")),
    style: rest.style,
    blocks: rest.blocks,
    limit: rest.limit,
    solution: rest.solution,
  };
}
