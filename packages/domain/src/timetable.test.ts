import { describe, expect, it } from "vitest";

import { isoWeekday, schoolDays, weekDates } from "./timetable";

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

describe("week dates", () => {
  it("dates a Sunday to Thursday week from any day in it", () => {
    const days = schoolDays(7, [5, 6]);
    const week = [
      { day: 7, date: "2026-10-04" },
      { day: 1, date: "2026-10-05" },
      { day: 2, date: "2026-10-06" },
      { day: 3, date: "2026-10-07" },
      { day: 4, date: "2026-10-08" },
    ];
    expect(weekDates("2026-10-04", 7, days)).toEqual(week);
    expect(weekDates("2026-10-07", 7, days)).toEqual(week);
    expect(weekDates("2026-10-10", 7, days)).toEqual(week);
  });

  it("dates a Monday to Friday week", () => {
    expect(weekDates("2026-10-04", 1, schoolDays(1, [6, 7]))).toEqual([
      { day: 1, date: "2026-09-28" },
      { day: 2, date: "2026-09-29" },
      { day: 3, date: "2026-09-30" },
      { day: 4, date: "2026-10-01" },
      { day: 5, date: "2026-10-02" },
    ]);
  });
});
