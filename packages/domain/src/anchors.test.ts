import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  anchorContains,
  anchorSchema,
  comparePoints,
  wholeBlock,
} from "./anchors";

const order = new Map([
  ["first000", 0],
  ["second00", 1],
  ["third000", 2],
]);

describe("anchors", () => {
  it("orders points by block, then by offset, a lost block last", () => {
    expect(
      comparePoints(
        { block: "first000", offset: 9 },
        { block: "second00", offset: 0 },
        order,
      ),
    ).toBeLessThan(0);
    expect(
      comparePoints(
        { block: "second00", offset: 4 },
        { block: "second00", offset: 2 },
        order,
      ),
    ).toBeGreaterThan(0);
    expect(
      comparePoints(
        { block: "gone0000", offset: 0 },
        { block: "third000", offset: 50 },
        order,
      ),
    ).toBeGreaterThan(0);
  });

  it("holds a point between its ends, ends included, across blocks", () => {
    const passage = {
      start: { block: "first000", offset: 3 },
      end: { block: "second00", offset: 5 },
    };
    expect(
      anchorContains(passage, { block: "first000", offset: 3 }, order),
    ).toBe(true);
    expect(
      anchorContains(passage, { block: "second00", offset: 5 }, order),
    ).toBe(true);
    expect(
      anchorContains(passage, { block: "first000", offset: 2 }, order),
    ).toBe(false);
    expect(
      anchorContains(passage, { block: "third000", offset: 0 }, order),
    ).toBe(false);
  });

  it("marks a whole block with a passage of no length", () => {
    const block = {
      start: { block: "second00", offset: 0 },
      end: { block: "second00", offset: 0 },
    };
    expect(wholeBlock(block)).toBe(true);
    expect(
      anchorContains(block, { block: "second00", offset: 40 }, order),
    ).toBe(true);
    expect(anchorContains(block, { block: "first000", offset: 0 }, order)).toBe(
      false,
    );
  });

  it("accepts only block ids the editor makes and offsets in range", () => {
    const valid = {
      start: { block: "p0x1zzzz", offset: 0 },
      end: { block: "p0x1zzzz", offset: 12 },
    };
    expect(v.is(anchorSchema, valid)).toBe(true);
    expect(
      v.is(anchorSchema, { ...valid, start: { block: "Bad id!", offset: 0 } }),
    ).toBe(false);
    expect(
      v.is(anchorSchema, { ...valid, end: { block: "p0x1zzzz", offset: -1 } }),
    ).toBe(false);
  });
});
