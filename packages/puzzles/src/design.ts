import type { Level, PuzzleStyle } from "./level";

import { HEADINGS, MAX_GEMS, MAX_SIDE, columnOf, rowOf } from "./level";
import { misfit } from "./run";

/** What a press on a square of the grid does to it. */
export const TOOLS = ["wall", "open", "start", "goal", "gem"] as const;
export type Tool = (typeof TOOLS)[number];

const clamp = (side: number) => Math.min(MAX_SIDE, Math.max(1, side));
const without = (cells: readonly number[], at: number) =>
  cells.filter((cell) => cell !== at);
const withCell = (cells: readonly number[], at: number) =>
  [...without(cells, at), at].toSorted((a, b) => a - b);

/**
 * A level with one square changed by a tool. The hero and the star are
 * moved by their own tools and never painted over, so a level always has
 * both; a wall or a gem pressed again is taken away.
 */
export function painted(level: Level, at: number, tool: Tool): Level {
  if (at === level.start.cell || at === level.goal) return level;
  const cleared = {
    ...level,
    walls: without(level.walls, at),
    gems: without(level.gems, at),
  };
  if (tool === "wall")
    return level.walls.includes(at)
      ? cleared
      : { ...cleared, walls: withCell(level.walls, at) };
  if (tool === "gem") {
    if (level.gems.includes(at)) return cleared;
    return level.gems.length >= MAX_GEMS
      ? level
      : { ...cleared, gems: withCell(level.gems, at) };
  }
  if (tool === "start")
    return { ...cleared, start: { ...level.start, cell: at } };
  return tool === "goal" ? { ...cleared, goal: at } : cleared;
}

/** A level with its hero turned a quarter clockwise where it stands. */
export function turned(level: Level): Level {
  const next = HEADINGS[(HEADINGS.indexOf(level.start.heading) + 1) % 4];
  return next ? { ...level, start: { ...level.start, heading: next } } : level;
}

/**
 * A level on a grid of another size. What still fits keeps its column and
 * row; the hero or the star, pushed off, takes the first or the last
 * square, cleared for it. A grid of one square is no puzzle, so the size
 * is kept to at least two.
 */
export function resized(level: Level, cols: number, rows: number): Level {
  const wide = clamp(cols);
  const high = wide === 1 ? Math.max(2, clamp(rows)) : clamp(rows);
  const moved = (at: number) => {
    const column = columnOf(level, at);
    const row = rowOf(level, at);
    return column < wide && row < high ? row * wide + column : null;
  };
  const kept = (cells: readonly number[]) =>
    cells.flatMap((cell) => moved(cell) ?? []);
  const last = wide * high - 1;
  let start = moved(level.start.cell);
  let goal = moved(level.goal);
  if (start === null) start = goal === 0 ? 1 : 0;
  if (goal === null) goal = start === last ? last - 1 : last;
  const free = (cell: number) => cell !== start && cell !== goal;
  return {
    ...level,
    cols: wide,
    rows: high,
    walls: kept(level.walls).filter(free),
    gems: kept(level.gems).filter(free),
    start: { ...level.start, cell: start },
    goal,
  };
}

/**
 * A level answered another way. A row of arrows offers no blocks to
 * choose; a program of blocks starts with the two that steer. The
 * teacher's answer is kept only where the new style can still say it.
 */
export function styled(level: Level, style: PuzzleStyle): Level {
  const next: Level = {
    ...level,
    style,
    blocks:
      style === "arrows"
        ? []
        : level.blocks.length > 0
          ? level.blocks
          : ["forward", "turn"],
    limit: style === "arrows" ? null : level.limit,
  };
  return misfit(next, next.solution) === "block"
    ? { ...next, solution: [] }
    : next;
}
