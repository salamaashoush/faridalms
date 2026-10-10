import { describe, expect, it } from "vitest";

import { landingIndex, landingOffset } from "./reorder";

// Four rows, the third taller, eight apart.
const rows = [
  { top: 0, height: 48 },
  { top: 56, height: 48 },
  { top: 112, height: 96 },
  { top: 216, height: 48 },
];

describe("a row dragged through its list", () => {
  it("stays where it is until its edge is half way over its neighbour", () => {
    expect(landingIndex(rows, 0, 0)).toBe(0);
    expect(landingIndex(rows, 0, 30)).toBe(0);
    expect(landingIndex(rows, 0, 34)).toBe(1);
    expect(landingIndex(rows, 2, -30)).toBe(2);
    expect(landingIndex(rows, 2, -34)).toBe(1);
  });

  it("passes several rows, and lands at either end when held against it", () => {
    expect(landingIndex(rows, 0, 120)).toBe(2);
    // As far down as the list goes: the row's foot on the last row's foot.
    expect(landingIndex(rows, 0, 216)).toBe(3);
    expect(landingIndex(rows, 3, -216)).toBe(0);
  });

  it("comes to rest past the rows it passed, whatever their heights", () => {
    expect(landingOffset(rows, 8, 0, 0)).toBe(0);
    expect(landingOffset(rows, 8, 0, 1)).toBe(56);
    expect(landingOffset(rows, 8, 0, 3)).toBe(56 + 104 + 56);
    expect(landingOffset(rows, 8, 3, 1)).toBe(-(56 + 104));
  });
});
