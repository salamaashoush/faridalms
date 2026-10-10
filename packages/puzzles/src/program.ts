import * as v from "valibot";

import type { BlockName, Heading, Side } from "./level";

/** The most blocks a program may have, and how deep one may sit in others. */
export const MAX_PROGRAM_BLOCKS = 80;
export const MAX_DEPTH = 5;
export const MAX_REPEATS = 20;

/**
 * One block of a puzzle's program. It is kept as what it does rather than
 * as the block editor's own save, so an answer reads the same whichever
 * editor made it and whatever version of it.
 */
export type Step =
  | { op: "go"; to: Heading }
  | { op: "forward" }
  | { op: "turn"; to: "left" | "right" }
  | { op: "repeat"; times: number; body: Step[] }
  | { op: "until"; body: Step[] }
  | { op: "if"; path: Side; body: Step[]; else?: Step[] };
export type Program = Step[];

const heading = v.picklist(["north", "east", "south", "west"]);

const stepSchema: v.GenericSchema<Step> = v.lazy(() =>
  v.variant("op", [
    v.object({ op: v.literal("go"), to: heading }),
    v.object({ op: v.literal("forward") }),
    v.object({ op: v.literal("turn"), to: v.picklist(["left", "right"]) }),
    v.object({
      op: v.literal("repeat"),
      times: v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.maxValue(MAX_REPEATS),
      ),
      body: v.array(stepSchema),
    }),
    v.object({ op: v.literal("until"), body: v.array(stepSchema) }),
    v.object({
      op: v.literal("if"),
      path: v.picklist(["ahead", "left", "right"]),
      body: v.array(stepSchema),
      else: v.optional(v.array(stepSchema)),
    }),
  ]),
);

/** The lists of blocks a block holds inside it. */
export function bodiesOf(step: Step): Step[][] {
  if (step.op === "go" || step.op === "forward" || step.op === "turn")
    return [];
  return step.op === "if" && step.else ? [step.body, step.else] : [step.body];
}

/** How many blocks a program is made of, those inside others counted too. */
export function countBlocks(program: readonly Step[]): number {
  return program.reduce(
    (count, step) =>
      count +
      1 +
      bodiesOf(step).reduce((inner, body) => inner + countBlocks(body), 0),
    0,
  );
}

function depthOf(program: readonly Step[]): number {
  return program.reduce(
    (deepest, step) =>
      Math.max(
        deepest,
        1 + Math.max(0, ...bodiesOf(step).map((body) => depthOf(body))),
      ),
    0,
  );
}

export const programSchema = v.pipe(
  v.array(stepSchema),
  v.check(
    (program) =>
      countBlocks(program) <= MAX_PROGRAM_BLOCKS &&
      depthOf(program) <= MAX_DEPTH,
    "puzzles.program_size",
  ),
);

/** The block a step is built with: a choice with an "else" is its own block. */
export function blockOf(step: Step): BlockName {
  return step.op === "if" && step.else ? "ifelse" : step.op;
}

/** The blocks a program uses, each once. */
export function blocksUsed(program: readonly Step[]): Set<BlockName> {
  const used = new Set<BlockName>();
  const walk = (steps: readonly Step[]) => {
    for (const step of steps) {
      used.add(blockOf(step));
      for (const body of bodiesOf(step)) walk(body);
    }
  };
  walk(program);
  return used;
}
