import { describe, expect, it } from "vitest";

import { addDays, daysBetween } from "./school";
import {
  DEFAULT_REPORT_WEEKS,
  defaultReportingSpan,
  MAX_REPORT_DAYS,
  rangeFits,
} from "./spans";

describe("the default reporting span", () => {
  it("is the last twelve weeks, the day itself included", () => {
    expect(DEFAULT_REPORT_WEEKS).toBe(12);
    const span = defaultReportingSpan("2026-11-12");
    expect(span).toEqual({ from: "2026-08-21", endsBefore: "2026-11-13" });
    expect(daysBetween(span.from, addDays(span.endsBefore, -1))).toBe(84);
  });
});

describe("a chosen range", () => {
  it("runs forwards and no longer than a report reads", () => {
    expect(rangeFits("2026-01-01", "2026-01-01")).toBe(true);
    expect(rangeFits("2026-01-02", "2026-01-01")).toBe(false);
    expect(
      rangeFits("2026-01-01", addDays("2026-01-01", MAX_REPORT_DAYS - 1)),
    ).toBe(true);
    expect(
      rangeFits("2026-01-01", addDays("2026-01-01", MAX_REPORT_DAYS)),
    ).toBe(false);
  });
});
