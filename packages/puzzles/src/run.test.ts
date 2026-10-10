import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { Step } from "./program";

import { facing, levelOf, levelSchema, neighbour } from "./level";
import { PACKS, firstLevel } from "./levels";
import { MAX_DEPTH, countBlocks, programSchema } from "./program";
import { misfit, run, solves } from "./run";
import { pythonOf } from "./text";

const forward: Step = { op: "forward" };
const left: Step = { op: "turn", to: "left" };
const right: Step = { op: "turn", to: "right" };

const corner = levelOf(["S..", "##.", "##G"], {
  heading: "east",
  style: "blocks",
  blocks: ["forward", "turn", "repeat", "until", "if", "ifelse"],
  limit: null,
  solution: [],
});

describe("a puzzle's grid", () => {
  it("stops at its edge and at a wall", () => {
    expect(neighbour(corner, 0, "north")).toBeNull();
    expect(neighbour(corner, 0, "south")).toBeNull();
    expect(neighbour(corner, 0, "east")).toBe(1);
    expect(neighbour(corner, 2, "south")).toBe(5);
  });

  it("turns the hero a quarter at a time", () => {
    expect(facing("north", "left")).toBe("west");
    expect(facing("west", "right")).toBe("north");
    expect(facing("south", "ahead")).toBe("south");
  });

  it("refuses two things on one square, or one off the grid", () => {
    const level = firstLevel("blocks");
    expect(v.safeParse(levelSchema, level).success).toBe(true);
    expect(
      v.safeParse(levelSchema, { ...level, walls: [level.goal] }).success,
    ).toBe(false);
    expect(v.safeParse(levelSchema, { ...level, gems: [40] }).success).toBe(
      false,
    );
  });
});

describe("running a program", () => {
  it("reaches the goal and stops there", () => {
    const result = run(corner, [
      forward,
      forward,
      right,
      forward,
      forward,
      forward,
    ]);
    expect(result.end).toBe("solved");
    expect(result.ticks.at(-1)).toEqual({
      kind: "move",
      at: [4],
      to: 8,
      heading: "south",
      gem: false,
    });
  });

  it("ends against a wall where the hero bumps", () => {
    const result = run(corner, [forward, right, forward]);
    expect(result.end).toBe("bumped");
    expect(result.ticks.at(-1)).toEqual({
      kind: "bump",
      at: [2],
      heading: "south",
    });
  });

  it("falls short when its blocks run out before the goal", () => {
    expect(run(corner, [forward]).end).toBe("short");
    expect(run(corner, []).end).toBe("short");
  });

  it("stops a loop that never gets anywhere", () => {
    expect(run(corner, [{ op: "until", body: [left] }]).end).toBe("endless");
    expect(run(corner, [{ op: "until", body: [] }]).end).toBe("endless");
  });

  it("says where in the program each move came from", () => {
    const result = run(corner, [
      { op: "repeat", times: 2, body: [forward] },
      {
        op: "if",
        path: "ahead",
        body: [forward],
        else: [right, forward],
      },
    ]);
    expect(result.ticks.map((tick) => tick.at)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1],
      [1, 1, 0],
      [1, 1, 1],
    ]);
  });

  it("counts the goal only once every gem is picked up", () => {
    const level = levelOf(["S*G", "..*"], {
      heading: "east",
      style: "arrows",
      blocks: [],
      limit: null,
      solution: [],
    });
    const east: Step = { op: "go", to: "east" };
    expect(run(level, [east, east]).end).toBe("short");
    const result = run(level, [
      east,
      east,
      { op: "go", to: "south" },
      { op: "go", to: "north" },
    ]);
    expect(result.end).toBe("solved");
    expect(result.gems).toEqual([1, 5]);
  });
});

describe("what a puzzle allows", () => {
  it("refuses a block it does not offer and a program over its limit", () => {
    const level = { ...corner, blocks: ["forward" as const], limit: 3 };
    expect(misfit(level, [forward, forward])).toBeNull();
    expect(misfit(level, [forward, right])).toBe("block");
    expect(misfit(level, [forward, forward, forward, forward])).toBe("limit");
    expect(
      misfit({ ...level, blocks: ["forward", "if"] }, [
        { op: "if", path: "ahead", body: [forward], else: [] },
      ]),
    ).toBe("block");
  });

  it("lets a row of arrows only step", () => {
    const level = firstLevel("arrows");
    expect(misfit(level, [{ op: "go", to: "east" }])).toBeNull();
    expect(misfit(level, [forward])).toBe("block");
  });

  it("counts the blocks inside other blocks", () => {
    expect(
      countBlocks([
        { op: "repeat", times: 3, body: [forward, right] },
        { op: "if", path: "left", body: [left], else: [forward] },
      ]),
    ).toBe(6);
  });

  it("refuses a program nested too deep", () => {
    let program: Step[] = [forward];
    for (let depth = 0; depth < MAX_DEPTH; depth += 1)
      program = [{ op: "repeat", times: 2, body: program }];
    expect(v.safeParse(programSchema, program).success).toBe(false);
    expect(v.safeParse(programSchema, [forward, left]).success).toBe(true);
    expect(
      v.safeParse(programSchema, [{ op: "jump" }, { op: "forward" }]).success,
    ).toBe(false);
  });
});

describe("the built-in puzzles", () => {
  it("are all well made and solved by their own answer", () => {
    for (const pack of PACKS)
      for (const [index, level] of pack.levels.entries()) {
        const name = `${pack.id} ${index + 1}`;
        expect({
          name,
          wellMade: v.safeParse(levelSchema, level).success,
          solved: solves(level, level.solution),
        }).toEqual({ name, wellMade: true, solved: true });
      }
  });
});

describe("a program as Python", () => {
  it("writes loops and choices with their blocks indented", () => {
    expect(
      pythonOf([
        { op: "go", to: "north" },
        {
          op: "until",
          body: [
            { op: "if", path: "ahead", body: [forward], else: [right] },
            { op: "repeat", times: 2, body: [] },
          ],
        },
      ]),
    ).toEqual([
      "go_up()",
      "while not at_goal():",
      "    if path_ahead():",
      "        forward()",
      "    else:",
      "        turn_right()",
      "    for count in range(2):",
      "        pass",
    ]);
  });
});
