import { describe, expect, it } from "vitest";

import { fillMask, reachOf, spreadRadius, spreadTime } from "./fill";

/** A white picture with a black box outline from (2,2) to (7,7). */
function boxed(width = 10, height = 10) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 2; y <= 7; y += 1)
    for (let x = 2; x <= 7; x += 1)
      if (x === 2 || x === 7 || y === 2 || y === 7) {
        const at = (y * width + x) * 4;
        pixels.set([0, 0, 0, 255], at);
      }
  return pixels;
}

const filled = (mask: Uint8Array, width: number, x: number, y: number) =>
  mask[y * width + x] === 1;

describe("filling an area", () => {
  it("fills inside a shape up to its line, and a little under it", () => {
    const mask = fillMask(boxed(), 10, 10, 4, 4);
    expect(filled(mask, 10, 4, 4)).toBe(true);
    expect(filled(mask, 10, 6, 6)).toBe(true);
    // The line itself takes the fill's edge, so no pale rim is left.
    expect(filled(mask, 10, 2, 4)).toBe(true);
    expect(filled(mask, 10, 0, 0)).toBe(false);
    expect(filled(mask, 10, 1, 4)).toBe(false);
  });

  it("fills outside a shape without crossing into it", () => {
    const mask = fillMask(boxed(), 10, 10, 0, 0);
    expect(filled(mask, 10, 9, 9)).toBe(true);
    expect(filled(mask, 10, 4, 4)).toBe(false);
  });

  it("fills nothing for a tap off the page", () => {
    expect(fillMask(boxed(), 10, 10, -1, 3).some(Boolean)).toBe(false);
  });
});

describe("a fill spreading from the tap", () => {
  it("reaches the farthest pixel it colours", () => {
    const mask = fillMask(boxed(), 10, 10, 4, 4);
    // The grown area takes in the box's sides but not its corners, so it
    // reaches (7,6) and no farther.
    expect(reachOf(mask, 10, 4, 4)).toBeCloseTo(Math.hypot(3, 2));
    expect(reachOf(new Uint8Array(100), 10, 4, 4)).toBe(0);
  });

  it("starts at the tap, ends at the edges, and never runs backwards", () => {
    const reach = 600;
    expect(spreadRadius(0, reach)).toBe(0);
    expect(spreadRadius(spreadTime(reach), reach)).toBe(reach);
    expect(spreadRadius(spreadTime(reach) * 3, reach)).toBe(reach);
    let last = 0;
    for (let at = 0; at <= spreadTime(reach); at += 25) {
      const radius = spreadRadius(at, reach);
      expect(radius).toBeGreaterThanOrEqual(last);
      last = radius;
    }
  });

  it("takes long enough to see and never long enough to wait for", () => {
    expect(spreadTime(5)).toBe(300);
    expect(spreadTime(600)).toBe(500);
    expect(spreadTime(1500)).toBe(900);
  });
});
