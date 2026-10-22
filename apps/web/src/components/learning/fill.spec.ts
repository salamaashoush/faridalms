import { describe, expect, it } from "vitest";

import { fillMask } from "./fill";

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
