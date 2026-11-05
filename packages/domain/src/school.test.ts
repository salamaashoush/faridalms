import { describe, expect, it } from "vitest";

import { spansOverlap } from "./school";

describe("spansOverlap", () => {
  it("shares a day only inside both spans, each ending before its end", () => {
    const term = { from: "2026-09-01", to: "2026-12-20" };
    expect(spansOverlap(term, { from: "2026-12-19", to: null })).toBe(true);
    expect(spansOverlap(term, { from: "2026-12-20", to: null })).toBe(false);
    expect(spansOverlap(term, { from: "2026-08-01", to: "2026-09-01" })).toBe(
      false,
    );
    expect(spansOverlap(term, { from: "2026-08-01", to: "2026-09-02" })).toBe(
      true,
    );
    expect(
      spansOverlap(
        { from: "2026-01-01", to: null },
        { from: "2030-01-01", to: null },
      ),
    ).toBe(true);
  });
});
