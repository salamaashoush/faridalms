import { describe, expect, it } from "vitest";

import { dayWithin, spanHolds, spansOverlap } from "./school";

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

describe("dayWithin", () => {
  const term = { from: "2026-09-13", to: "2026-12-20" };

  it("is today inside the span, else its first or last day", () => {
    expect(dayWithin(term, "2026-10-01")).toBe("2026-10-01");
    expect(dayWithin(term, "2026-09-01")).toBe("2026-09-13");
    expect(dayWithin(term, "2027-01-05")).toBe("2026-12-19");
  });

  it("is today for a span with no end once it has begun", () => {
    expect(dayWithin({ from: "2026-09-13", to: null }, "2030-01-01")).toBe(
      "2030-01-01",
    );
  });
});

describe("spanHolds", () => {
  const year = { from: "2026-09-13", to: "2027-06-18" };

  it("holds a span inside it and refuses one that runs past either edge", () => {
    expect(spanHolds(year, { from: "2026-09-13", to: "2027-06-18" })).toBe(
      true,
    );
    expect(spanHolds(year, { from: "2026-09-12", to: "2027-01-01" })).toBe(
      false,
    );
    expect(spanHolds(year, { from: "2026-10-01", to: null })).toBe(false);
    expect(
      spanHolds(
        { from: "2026-09-13", to: null },
        { from: "2027-01-01", to: null },
      ),
    ).toBe(true);
  });
});
