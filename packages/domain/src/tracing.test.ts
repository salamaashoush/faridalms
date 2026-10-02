import { describe, expect, it } from "vitest";

import { strokeMatches, traceResults } from "./tracing";

// The downward stroke of a "b", then its bowl.
const down = [0.3, 0.1, 0.3, 0.5, 0.3, 0.9];
const bowl = [0.3, 0.6, 0.5, 0.5, 0.7, 0.7, 0.5, 0.9, 0.3, 0.85];

describe("tracing a letter", () => {
  it("takes a wobbly stroke that starts, ends and goes where the model does", () => {
    expect(
      strokeMatches(down, [0.32, 0.12, 0.27, 0.4, 0.33, 0.62, 0.29, 0.88]),
    ).toBe(true);
  });

  it("refuses the right shape drawn the wrong way", () => {
    expect(strokeMatches(down, [0.3, 0.9, 0.3, 0.5, 0.3, 0.1])).toBe(false);
  });

  it("refuses a stroke far from the model", () => {
    expect(strokeMatches(down, [0.7, 0.1, 0.7, 0.9])).toBe(false);
  });

  it("takes a tap on a dot", () => {
    expect(strokeMatches([0.5, 0.2, 0.5, 0.21], [0.52, 0.22])).toBe(true);
  });

  it("marks each stroke in its place, and a missing one wrong", () => {
    expect(traceResults([down, bowl], [down])).toEqual({
      "stroke-1": true,
      "stroke-2": false,
    });
    expect(traceResults([down, bowl], [down, bowl])).toEqual({
      "stroke-1": true,
      "stroke-2": true,
    });
  });
});
