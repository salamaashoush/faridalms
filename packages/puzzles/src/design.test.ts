import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { painted, resized, styled, turned } from "./design";
import { MAX_GEMS, levelOf, levelSchema } from "./level";
import { PACKS } from "./levels";
import { framesOf } from "./playback";
import { run } from "./run";

const level = levelOf(["S.#", "..*", "..G"], {
  heading: "east",
  style: "blocks",
  blocks: ["forward", "turn"],
  limit: null,
  solution: [],
});

describe("painting a puzzle's grid", () => {
  it("puts a wall up, and takes it down when pressed again", () => {
    const walled = painted(level, 1, "wall");
    expect(walled.walls).toEqual([1, 2]);
    expect(painted(walled, 1, "wall").walls).toEqual([2]);
  });

  it("puts one thing on a square, whatever was there", () => {
    const gem = painted(level, 2, "gem");
    expect(gem.walls).toEqual([]);
    expect(gem.gems).toEqual([2, 5]);
    expect(painted(level, 5, "wall")).toMatchObject({
      walls: [2, 5],
      gems: [],
    });
    expect(painted(level, 5, "open").gems).toEqual([]);
  });

  it("moves the hero and the star, and never paints over them", () => {
    expect(painted(level, 5, "start")).toMatchObject({
      start: { cell: 5, heading: "east" },
      gems: [],
    });
    expect(painted(level, 2, "goal")).toMatchObject({ goal: 2, walls: [] });
    expect(painted(level, 0, "wall")).toBe(level);
    expect(painted(level, 8, "start")).toBe(level);
    expect(painted(level, 0, "goal")).toBe(level);
  });

  it("stops at the most gems a puzzle may have", () => {
    const wide = levelOf(["S......G"], {
      heading: "east",
      style: "arrows",
      blocks: [],
      limit: null,
      solution: [],
    });
    let full = resized(wide, 8, 8);
    for (let at = 8; at < 8 + MAX_GEMS; at += 1)
      full = painted(full, at, "gem");
    expect(full.gems).toHaveLength(MAX_GEMS);
    expect(painted(full, 40, "gem")).toBe(full);
  });

  it("turns the hero a quarter at a time, all the way round", () => {
    expect(turned(level).start.heading).toBe("south");
    expect(turned(turned(turned(turned(level)))).start.heading).toBe("east");
  });
});

describe("changing a puzzle's size", () => {
  it("keeps what still fits where it was", () => {
    const wider = resized(level, 4, 3);
    expect(wider).toMatchObject({
      cols: 4,
      rows: 3,
      walls: [2],
      gems: [6],
      goal: 10,
    });
    expect(v.safeParse(levelSchema, wider).success).toBe(true);
  });

  it("finds the hero and the star a square when theirs is cut off", () => {
    const narrow = resized(level, 2, 2);
    expect(narrow).toMatchObject({ cols: 2, rows: 2, walls: [], gems: [] });
    expect(narrow.start.cell).toBe(0);
    expect(narrow.goal).toBe(3);
    expect(v.safeParse(levelSchema, narrow).success).toBe(true);
    const flipped = resized(
      painted(painted(level, 4, "goal"), 8, "start"),
      2,
      2,
    );
    expect(flipped.goal).toBe(3);
    expect(flipped.start.cell).toBe(0);
  });

  it("never makes a grid of one square", () => {
    const smallest = resized(level, 1, 1);
    expect([smallest.cols, smallest.rows]).toEqual([1, 2]);
    expect(v.safeParse(levelSchema, smallest).success).toBe(true);
  });
});

describe("changing how a puzzle is answered", () => {
  it("drops an answer the new style cannot say, and keeps one it can", () => {
    const paths = PACKS[1].levels[1];
    expect(styled(paths, "arrows")).toMatchObject({
      style: "arrows",
      blocks: [],
      limit: null,
      solution: [],
    });
    expect(styled(paths, "blocks").solution).toEqual(paths.solution);
    expect(styled(PACKS[0].levels[0], "blocks")).toMatchObject({
      blocks: ["forward", "turn"],
      solution: [],
    });
  });
});

describe("playing a run back", () => {
  it("shows one frame for each thing the hero does, and two for a bump", () => {
    const frames = framesOf(
      level,
      run(level, [
        { op: "forward" },
        { op: "turn", to: "left" },
        { op: "forward" },
      ]),
    );
    expect(
      frames.map((frame) => [frame.cell, frame.angle, frame.nudge]),
    ).toEqual([
      [0, 90, null],
      [1, 90, null],
      [1, 0, null],
      [1, 0, "north"],
      [1, 0, null],
    ]);
    expect(frames[0]?.at).toBeNull();
    expect(frames.at(-1)?.at).toEqual([2]);
  });

  it("turns the short way round and remembers the gems picked up", () => {
    const frames = framesOf(
      level,
      run(level, [
        { op: "go", to: "south" },
        { op: "go", to: "east" },
        { op: "go", to: "east" },
        { op: "go", to: "north" },
      ]),
    );
    // The last step meets the wall above the gem: a lurch, then back.
    expect(frames.map((frame) => frame.angle)).toEqual([90, 180, 90, 90, 0, 0]);
    expect(frames.at(-1)?.taken).toEqual([5]);
  });
});
