import { describe, expect, it } from "vitest";

import { isoWeekday, schoolDays } from "./timetable";

describe("school days", () => {
  it("runs from the first day of the week and skips the weekend", () => {
    expect(schoolDays(7, [5, 6])).toEqual([7, 1, 2, 3, 4]);
    expect(schoolDays(1, [6, 7])).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads Sunday as the seventh ISO day", () => {
    expect(isoWeekday("2026-09-27")).toBe(7);
    expect(isoWeekday("2026-09-28")).toBe(1);
  });
});
