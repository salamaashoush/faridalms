import type { Heading, Level, Side } from "./level";
import type { Program, Step } from "./program";

import { blocksOf, facing, neighbour } from "./level";
import { blocksUsed, countBlocks } from "./program";

/**
 * Where a block sits in its program: its place in the list, then, for a
 * block inside another, which of that block's lists and its place there,
 * and so on down.
 */
export type Place = readonly number[];

/** One thing the hero does, and the block that had it do so. */
export type Tick =
  | { kind: "move"; at: Place; to: number; heading: Heading; gem: boolean }
  | { kind: "turn"; at: Place; heading: Heading }
  | { kind: "bump"; at: Place; heading: Heading }
  | { kind: "look"; at: Place; side: Side; open: boolean };

/**
 * How a run ended: at the goal with every gem, into a wall, out of blocks
 * before the goal, or still going when it was stopped.
 */
export type End = "solved" | "bumped" | "short" | "endless";

export interface Run {
  ticks: Tick[];
  end: End;
  /** The gems picked up, in the order the hero reached them. */
  gems: number[];
}

type World = Pick<Level, "cols" | "rows" | "walls" | "gems" | "start" | "goal">;

/**
 * How many blocks one run may carry out. A loop that never reaches the
 * goal is stopped here, long after any puzzle on an eight by eight grid is
 * done.
 */
const FUEL = 2000;

class Stopped extends Error {
  constructor(readonly end: End) {
    super(end);
  }
}

/**
 * Carries out a program on a puzzle and tells everything the hero did.
 * The same run decides a student's answer in the browser and at the
 * server, and is what the board plays back.
 */
export function run(level: World, program: Program): Run {
  const ticks: Tick[] = [];
  const gems: number[] = [];
  let cell = level.start.cell;
  let heading = level.start.heading;
  let fuel = FUEL;

  const burn = () => {
    fuel -= 1;
    if (fuel < 0) throw new Stopped("endless");
  };
  const step = (at: Place, towards: Heading) => {
    heading = towards;
    const next = neighbour(level, cell, towards);
    if (next === null) {
      ticks.push({ kind: "bump", at, heading });
      throw new Stopped("bumped");
    }
    cell = next;
    const gem = level.gems.includes(cell) && !gems.includes(cell);
    if (gem) gems.push(cell);
    ticks.push({ kind: "move", at, to: cell, heading, gem });
    if (cell === level.goal && gems.length === level.gems.length)
      throw new Stopped("solved");
  };
  const carryOut = (steps: readonly Step[], within: Place) => {
    for (const [index, block] of steps.entries()) {
      const at = [...within, index];
      burn();
      switch (block.op) {
        case "go":
          step(at, block.to);
          break;
        case "forward":
          step(at, heading);
          break;
        case "turn":
          heading = facing(heading, block.to);
          ticks.push({ kind: "turn", at, heading });
          break;
        case "repeat":
          for (let time = 0; time < block.times; time += 1)
            carryOut(block.body, [...at, 0]);
          break;
        case "until":
          // Reaching the goal ends the run, so the loop only ever goes on.
          for (;;) {
            burn();
            carryOut(block.body, [...at, 0]);
          }
        case "if": {
          const open =
            neighbour(level, cell, facing(heading, block.path)) !== null;
          ticks.push({ kind: "look", at, side: block.path, open });
          if (open) carryOut(block.body, [...at, 0]);
          else if (block.else) carryOut(block.else, [...at, 1]);
          break;
        }
      }
    }
  };

  try {
    carryOut(program, []);
  } catch (error) {
    if (!(error instanceof Stopped)) throw error;
    return { ticks, end: error.end, gems };
  }
  return { ticks, end: "short", gems };
}

/**
 * Why a program may not be run on a puzzle, or null when it may: it uses
 * a block the puzzle does not offer, or more blocks than it allows.
 */
export function misfit(
  level: Pick<Level, "style" | "blocks" | "limit">,
  program: Program,
): "block" | "limit" | null {
  const offered = new Set(blocksOf(level));
  if ([...blocksUsed(program)].some((block) => !offered.has(block)))
    return "block";
  return level.limit !== null && countBlocks(program) > level.limit
    ? "limit"
    : null;
}

/** Whether a program, built from what the puzzle offers, takes the hero to the goal. */
export function solves(
  level: World & Pick<Level, "style" | "blocks" | "limit">,
  program: Program,
): boolean {
  return (
    misfit(level, program) === null && run(level, program).end === "solved"
  );
}
