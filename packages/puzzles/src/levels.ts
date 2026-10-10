import type { Heading, Level, PuzzleStyle } from "./level";
import type { Step } from "./program";

import { levelOf } from "./level";
import { countBlocks } from "./program";

const go = (to: Heading): Step => ({ op: "go", to });
const forward: Step = { op: "forward" };
const left: Step = { op: "turn", to: "left" };
const right: Step = { op: "turn", to: "right" };
const times = (count: number, step: Step): Step[] =>
  Array.from({ length: count }, () => step);

/** A built-in level allows as many blocks as its own answer takes. */
function made(
  map: readonly string[],
  heading: Heading,
  style: PuzzleStyle,
  blocks: Level["blocks"],
  solution: Step[],
): Level {
  return levelOf(map, {
    heading,
    style,
    blocks,
    limit: style === "arrows" ? null : countBlocks(solution),
    solution,
  });
}

/**
 * The puzzles a teacher can start from, in the order the ideas are met:
 * a row of arrows, then steering with blocks, loops, and choices. Each is
 * a starting point: the teacher changes the grid, the blocks and the
 * answer as they like.
 */
export const PACKS = [
  {
    id: "arrows",
    levels: [
      made(["S..G"], "east", "arrows", [], times(3, go("east"))),
      made(
        ["S..", "##.", "##G"],
        "east",
        "arrows",
        [],
        [...times(2, go("east")), ...times(2, go("south"))],
      ),
      made(
        ["S.*", "#..", "G.."],
        "east",
        "arrows",
        [],
        [
          ...times(2, go("east")),
          ...times(2, go("south")),
          ...times(2, go("west")),
        ],
      ),
      made(
        ["S#..G", ".#.#.", "...#."],
        "south",
        "arrows",
        [],
        [
          ...times(2, go("south")),
          ...times(2, go("east")),
          ...times(2, go("north")),
          ...times(2, go("east")),
        ],
      ),
    ],
  },
  {
    id: "paths",
    levels: [
      made(["S..G"], "east", "blocks", ["forward"], times(3, forward)),
      made(
        ["S..", "##.", "##G"],
        "east",
        "blocks",
        ["forward", "turn"],
        [forward, forward, right, forward, forward],
      ),
      made(
        ["G..", "##.", "S.."],
        "east",
        "blocks",
        ["forward", "turn"],
        [forward, forward, left, forward, forward, left, forward, forward],
      ),
      made(
        ["S.*.", "###.", "G..."],
        "east",
        "blocks",
        ["forward", "turn"],
        [
          ...times(3, forward),
          right,
          ...times(2, forward),
          right,
          ...times(3, forward),
        ],
      ),
    ],
  },
  {
    id: "loops",
    levels: [
      made(
        ["S.....G"],
        "east",
        "blocks",
        ["forward", "repeat"],
        [{ op: "repeat", times: 6, body: [forward] }],
      ),
      made(
        ["S.###", "#..##", "##..#", "###.G"],
        "east",
        "blocks",
        ["forward", "turn", "repeat"],
        [
          { op: "repeat", times: 3, body: [forward, right, forward, left] },
          forward,
        ],
      ),
      made(
        ["S.*", ".#.", "G.*"],
        "east",
        "blocks",
        ["forward", "turn", "repeat"],
        [{ op: "repeat", times: 3, body: [forward, forward, right] }],
      ),
      made(
        ["S......G"],
        "east",
        "blocks",
        ["forward", "turn", "until"],
        [{ op: "until", body: [forward] }],
      ),
      made(
        [
          "S.######",
          "#..#####",
          "##..####",
          "###..###",
          "####..##",
          "#####.G#",
        ],
        "east",
        "blocks",
        ["forward", "turn", "until"],
        [{ op: "until", body: [forward, right, forward, left] }],
      ),
    ],
  },
  {
    id: "choices",
    levels: [
      made(
        ["....G", ".####", ".####", "S####"],
        "north",
        "blocks",
        ["forward", "turn", "until", "ifelse"],
        [
          {
            op: "until",
            body: [{ op: "if", path: "ahead", body: [forward], else: [right] }],
          },
        ],
      ),
      made(
        ["G###", ".###", "...S"],
        "west",
        "blocks",
        ["forward", "turn", "until", "if"],
        [
          {
            op: "until",
            body: [forward, { op: "if", path: "right", body: [right] }],
          },
        ],
      ),
      made(
        ["#G###", "#...#", "###.#", "S...#"],
        "east",
        "blocks",
        ["forward", "turn", "until", "ifelse"],
        [
          {
            op: "until",
            body: [
              {
                op: "if",
                path: "left",
                body: [left, forward],
                else: [
                  { op: "if", path: "ahead", body: [forward], else: [right] },
                ],
              },
            ],
          },
        ],
      ),
    ],
  },
] as const satisfies readonly { id: string; levels: readonly Level[] }[];

export type PackId = (typeof PACKS)[number]["id"];

/** The puzzle a new question starts as: the first of its style. */
export function firstLevel(style: PuzzleStyle): Level {
  // A copy, since the question it starts goes on to change it.
  return structuredClone(
    style === "arrows" ? PACKS[0].levels[0] : PACKS[1].levels[0],
  );
}
