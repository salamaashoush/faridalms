import { describe, expect, it } from "vitest";

import { placeUnder } from "./drag";

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});
const pile = { id: "bank", box: box(0, 0, 600, 300) };
const real = { id: "real", box: box(0, 320, 280, 160) };
const made = { id: "made", box: box(320, 320, 280, 160) };
// A place drawn inside its group, as a group's own drop area is.
const inner = { id: "made", box: box(340, 360, 240, 100) };
const places = [pile, real, made, inner];
const card = (x: number, y: number) => box(x - 60, y - 40, 120, 80);

describe("the place a held card is over", () => {
  it("is the place under the finger", () => {
    expect(placeUnder({ x: 100, y: 400 }, card(100, 400), places, "bank")).toBe(
      "real",
    );
    expect(placeUnder({ x: 450, y: 400 }, card(450, 400), places, "bank")).toBe(
      "made",
    );
  });

  it("is the place a near miss mostly lies over, since a small hand is not exact", () => {
    // The finger stops in the gap above the group, the card half over it.
    expect(placeUnder({ x: 100, y: 310 }, card(100, 310), places, "bank")).toBe(
      "real",
    );
    // Between two groups, the one more of the card covers.
    expect(placeUnder({ x: 305, y: 400 }, card(305, 400), places, "bank")).toBe(
      "made",
    );
  });

  it("is the pile only when no place takes the card", () => {
    expect(placeUnder({ x: 300, y: 100 }, card(300, 100), places, "bank")).toBe(
      "bank",
    );
    // A corner of the card over a group is not enough to leave the pile.
    expect(placeUnder({ x: 100, y: 268 }, card(100, 268), places, "bank")).toBe(
      "bank",
    );
  });

  it("is nowhere when the card is let go over nothing", () => {
    expect(
      placeUnder({ x: 900, y: 900 }, card(900, 900), places, "bank"),
    ).toBeNull();
    expect(
      placeUnder({ x: 100, y: 100 }, card(100, 100), [], "bank"),
    ).toBeNull();
  });
});
