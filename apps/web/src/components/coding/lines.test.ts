import { describe, expect, it } from "vitest";

import { changedLines } from "./lines";

describe("lines a step changed", () => {
  it("marks an edited line and an added one, leaving the rest quiet", () => {
    const before = ["n = input()", "print(n * n)"];
    const after = ["n = int(input())", "print(n * n)", "print('done')"];
    expect([...changedLines(before, after)]).toEqual([0, 2]);
  });

  it("marks nothing when only lines were taken out", () => {
    expect(changedLines(["a", "b", "c"], ["a", "c"]).size).toBe(0);
  });

  it("marks only the line moved, not the ones it passed", () => {
    expect([...changedLines(["a", "b", "c"], ["b", "c", "a"])]).toEqual([2]);
  });
});
