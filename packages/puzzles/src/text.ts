import type { Heading } from "./level";
import type { Program, Step } from "./program";
import type { PuzzleStrings } from "./strings";

import { bodiesOf } from "./program";

const GO: Record<Heading, string> = {
  north: "go_up()",
  east: "go_right()",
  south: "go_down()",
  west: "go_left()",
};

const INDENT = "    ";

function lines(steps: readonly Step[], depth: number): string[] {
  const pad = INDENT.repeat(depth);
  // Python has no empty block; one that does nothing says so.
  if (steps.length === 0) return [`${pad}pass`];
  return steps.flatMap((step) => {
    if (step.op === "go") return [`${pad}${GO[step.to]}`];
    if (step.op === "forward") return [`${pad}forward()`];
    if (step.op === "turn") return [`${pad}turn_${step.to}()`];
    const inside = lines(step.body, depth + 1);
    if (step.op === "repeat")
      return [`${pad}for count in range(${step.times}):`, ...inside];
    if (step.op === "until") return [`${pad}while not at_goal():`, ...inside];
    return [
      `${pad}if path_${step.path}():`,
      ...inside,
      ...(step.else ? [`${pad}else:`, ...lines(step.else, depth + 1)] : []),
    ];
  });
}

/**
 * A program of blocks written out as Python, line by line, for a student
 * to see what their blocks say in a language they will type, and for a
 * teacher to read an answer without the board.
 */
export function pythonOf(program: Program): string[] {
  return program.length === 0 ? [] : lines(program, 0);
}

/** A block's words with its field's value where the words leave room for it. */
const filled = (words: string, value: string) =>
  words.replace("%1", value).trim();

/** One block of a program as its words, and how deep inside others it sits. */
export interface BlockLine {
  text: string;
  depth: number;
}

/**
 * A program as the words on its blocks, one block to a line, as a student
 * reads it in the block editor and writes it on paper.
 */
export function wordsOf(
  program: Program,
  blocks: PuzzleStrings["blocks"],
): BlockLine[] {
  const said = (step: Step): string => {
    if (step.op === "go") return filled(blocks.go, blocks.directions[step.to]);
    if (step.op === "forward") return blocks.forward;
    if (step.op === "turn") return filled(blocks.turn, blocks.turns[step.to]);
    if (step.op === "repeat") return filled(blocks.repeat, String(step.times));
    if (step.op === "until") return blocks.until;
    return filled(blocks.if, blocks.sides[step.path]);
  };
  const walk = (steps: readonly Step[], depth: number): BlockLine[] =>
    steps.flatMap((step) => {
      const [body = [], otherwise] = bodiesOf(step);
      return [
        { text: said(step), depth },
        ...walk(body, depth + 1),
        ...(otherwise
          ? [{ text: blocks.else, depth }, ...walk(otherwise, depth + 1)]
          : []),
      ];
    });
  return walk(program, 0);
}

/** The arrow a step towards a side of the grid is drawn as. */
export const ARROWS: Record<Heading, string> = {
  north: "↑",
  east: "→",
  south: "↓",
  west: "←",
};
